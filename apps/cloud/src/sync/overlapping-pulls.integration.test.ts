import { createCategory, createProduct } from "@purosur/domain/catalog/use-cases";
import { pullChanges } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import {
  branchHours,
  branchSettings,
  deviceState,
  productBarcodes,
  products,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleChangeLog } from "./drizzle-change-log.js";
import type { PulledCloudChange } from "./pulled-changes.js";

// PGlite runs every query over one connection, so two pulls can never overlap there.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("overlapping_pulls");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two pulls of the same device overlapping, on a real Postgres", () => {
  it("answers the later one once the earlier one commits, instead of failing it", async () => {
    const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db);
    const ports = { changeLog: new DrizzleChangeLog(db), clock: { now: () => new Date() } };
    await pullChanges(ports, { deviceId, locationId, registerId, since: 0 });

    let markEarlierRecorded = () => {};
    const earlierIsRecorded = new Promise<void>((resolve) => {
      markEarlierRecorded = resolve;
    });
    let letEarlierCommit = () => {};
    const earlierMayCommit = new Promise<void>((resolve) => {
      letEarlierCommit = resolve;
    });
    const earlier = db.transaction(async (tx) => {
      await tx
        .update(deviceState)
        .set({ lastPullSince: 2 })
        .where(eq(deviceState.deviceId, deviceId));
      markEarlierRecorded();
      await earlierMayCommit;
    });
    await earlierIsRecorded;

    const later = pullChanges(ports, { deviceId, locationId, registerId, since: 4 });
    try {
      await waitForLockWaiters(sql, 1);
    } finally {
      letEarlierCommit();
    }
    await earlier;

    await expect(later).resolves.toMatchObject({ cursor: 4, hasMore: false });
  });

  it("waits for a save of the branch's settings under way, then gives its settings with its hours", async () => {
    const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db, {
      registerName: "Caja 2",
    });
    const ports = { changeLog: new DrizzleChangeLog(db), clock: { now: () => new Date() } };

    let markSaveUnderWay = () => {};
    const saveIsUnderWay = new Promise<void>((resolve) => {
      markSaveUnderWay = resolve;
    });
    let letSaveCommit = () => {};
    const saveMayCommit = new Promise<void>((resolve) => {
      letSaveCommit = resolve;
    });
    const save = db.transaction(async (tx) => {
      await tx
        .select({ locationId: branchSettings.locationId })
        .from(branchSettings)
        .where(eq(branchSettings.locationId, locationId))
        .for("update");
      await tx
        .update(branchSettings)
        .set({ address: "Av. Belgrano 1450", version: 2 })
        .where(eq(branchSettings.locationId, locationId));
      markSaveUnderWay();
      await saveMayCommit;
      await tx
        .insert(branchHours)
        .values({ locationId, dayOfWeek: 1, position: 0, opensAt: "09:00", closesAt: "13:00" });
    });
    await saveIsUnderWay;

    const pull = pullChanges(ports, { deviceId, locationId, registerId, since: 0 });
    try {
      await waitForLockWaiters(sql, 1);
    } finally {
      letSaveCommit();
    }
    await save;

    const page = await pull;
    expect(page.changes[0]).toMatchObject({
      row: {
        address: "Av. Belgrano 1450",
        version: 2,
        hours: [{ dayOfWeek: 1, position: 0, opensAt: "09:00:00", closesAt: "13:00:00" }],
      },
    });
  });

  it("waits for a product edit under way, then gives the product edited, with its new barcodes", async () => {
    const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db, {
      registerName: "Caja 3",
    });
    const ports = { changeLog: new DrizzleChangeLog(db), clock: { now: () => new Date() } };
    const store = new DrizzleCatalogStore(db);
    const category = await createCategory(store, { name: "Almacén", parentId: null });
    if (category.kind !== "created") {
      throw new Error("test setup: the category was not created");
    }
    const created = await createProduct(store, {
      name: "Arroz",
      categoryId: category.category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7790001000011"],
      netContent: null,
      tagIds: [],
    });
    if (created.kind !== "created") {
      throw new Error("test setup: the product was not created");
    }
    const productId = created.product.id;

    let markEditUnderWay = () => {};
    const editIsUnderWay = new Promise<void>((resolve) => {
      markEditUnderWay = resolve;
    });
    let letEditCommit = () => {};
    const editMayCommit = new Promise<void>((resolve) => {
      letEditCommit = resolve;
    });
    const edit = db.transaction(async (tx) => {
      await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productId))
        .for("update");
      await tx
        .update(products)
        .set({ name: "Arroz largo fino", version: 2 })
        .where(eq(products.id, productId));
      markEditUnderWay();
      await editMayCommit;
      await tx.insert(productBarcodes).values({ productId, position: 1, code: "7790001000028" });
    });
    await editIsUnderWay;

    const pull = pullChanges(ports, { deviceId, locationId, registerId, since: 0 });
    try {
      await waitForLockWaiters(sql, 1);
    } finally {
      letEditCommit();
    }
    await edit;

    const page = await pull;
    expect(page.changes.find((change) => change.entity === "product")).toMatchObject({
      row: {
        name: "Arroz largo fino",
        version: 2,
        barcodes: [
          { position: 0, code: "7790001000011" },
          { position: 1, code: "7790001000028" },
        ],
      },
    });
  });

  it("gives a category a writer holds locked as it was, without waiting for the writer", async () => {
    const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db, {
      registerName: "Caja 4",
    });
    const ports = { changeLog: new DrizzleChangeLog(db), clock: { now: () => new Date() } };
    const created = await createCategory(new DrizzleCatalogStore(db), {
      name: "Bebidas",
      parentId: null,
    });
    if (created.kind !== "created") {
      throw new Error("test setup: the category was not created");
    }
    const categoryId = created.category.id;

    const holder = await sql.reserve();
    let page: Awaited<ReturnType<typeof pullChanges<PulledCloudChange>>> | undefined;
    try {
      await holder`begin`;
      await holder`select id from categories where id = ${categoryId} for update`;
      await holder`update categories set name = 'Bebidas y jugos', version = 2 where id = ${categoryId}`;

      page = await pullChanges(ports, { deviceId, locationId, registerId, since: 0 });
    } finally {
      await holder`rollback`;
      holder.release();
    }

    expect(page?.changes.find((change) => change.entityId === categoryId)).toMatchObject({
      row: { name: "Bebidas", version: 1 },
    });
  });
});
