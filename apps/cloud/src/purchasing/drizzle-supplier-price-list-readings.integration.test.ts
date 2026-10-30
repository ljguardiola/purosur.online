import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListReadings } from "./drizzle-supplier-price-list-readings.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertReread,
  insertSupplier,
} from "./test-support/supplier-price-list-fixtures.js";

const SENT_AT = new Date("2026-03-10T14:40:00.000Z");
const LOCKED_AT = new Date("2026-03-10T14:39:58.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let admin: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let actorId: string;
let locationId: string;
let supplierId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("supplier_price_list_readings");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(async () => {
  await sql`delete from supplier_price_list_rereads`;
  await sql`delete from supplier_price_list_rows`;
  await sql`delete from supplier_price_lists`;
  await sql`delete from graphile_worker._private_jobs`;
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
  supplierId = await insertSupplier(db, { actorId });
});

async function queueReading(listId: string): Promise<void> {
  await new DrizzleSupplierPriceListStore(db, () => SENT_AT).transaction((tx) =>
    tx.enqueueReading(listId),
  );
}

async function lockReadingJob(listId: string, lockedAt: Date, workerId: string): Promise<void> {
  await admin`update graphile_worker._private_jobs
    set locked_at = ${lockedAt}, locked_by = ${workerId}
    where key = ${listId}`;
}

const readings = () => new DrizzleSupplierPriceListReadings(db);

describe("DrizzleSupplierPriceListReadings", () => {
  it("answers when the reading of a list started from the lock a stopped worker left on its job", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      sentAt: SENT_AT,
      sentOn: "2026-03-10",
    });
    await queueReading(listId);
    await lockReadingJob(listId, LOCKED_AT, "worker-of-a-stopped-cloud");

    expect(await readings().listInProgress()).toEqual([
      { listId, sentAt: SENT_AT, readingStartedAt: LOCKED_AT },
    ]);
  });

  it("answers no start for a list whose reading job is waiting in the queue", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });
    await queueReading(listId);

    expect(await readings().listInProgress()).toEqual([
      { listId, sentAt: null, readingStartedAt: null },
    ]);
  });

  it("answers no start for a list that has no reading job", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    expect(await readings().listInProgress()).toEqual([
      { listId, sentAt: null, readingStartedAt: null },
    ]);
  });

  it("ignores another task's job that shares the list's key", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });
    await sql`select graphile_worker.add_job('another-task', '{}'::json, job_key => ${listId}::text)`;
    await lockReadingJob(listId, LOCKED_AT, "worker-of-a-stopped-cloud");

    expect(await readings().listInProgress()).toEqual([
      { listId, sentAt: null, readingStartedAt: null },
    ]);
  });

  it("lists only the lists still being read", async () => {
    const reading = await insertPriceList(db, { supplierId, locationId, actorId });
    for (const state of ["READ_FAILED", "EXTRACTED", "REVIEWED", "DISCARDED"] as const) {
      await insertPriceList(db, {
        supplierId,
        locationId,
        actorId,
        state,
        ...(state === "READ_FAILED" ? { readFailure: "interrupted" as const } : {}),
      });
    }

    expect((await readings().listInProgress()).map((entry) => entry.listId)).toEqual([reading]);
  });

  it("lists the open reread of a list that is not being read for the first time, with the reread's own id and send instant", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
      sentAt: new Date("2026-03-10T10:00:00.000Z"),
      sentOn: "2026-03-10",
    });
    const rereadId = await insertReread(db, {
      listId,
      locationId,
      actorId,
      sentAt: SENT_AT,
      sentOn: "2026-03-10",
    });
    await queueReading(listId);
    await lockReadingJob(listId, LOCKED_AT, "worker-of-a-stopped-cloud");

    expect(await readings().listInProgress()).toEqual([
      { listId, rereadId, sentAt: SENT_AT, readingStartedAt: LOCKED_AT },
    ]);
  });

  it("answers no start for an open reread whose job is waiting in the queue", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const rereadId = await insertReread(db, { listId, locationId, actorId });
    await queueReading(listId);

    expect(await readings().listInProgress()).toEqual([
      { listId, rereadId, sentAt: null, readingStartedAt: null },
    ]);
  });

  it("does not list a reread that ended", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    await insertReread(db, { listId, locationId, actorId, state: "READ" });
    await insertReread(db, {
      listId,
      locationId,
      actorId,
      state: "READ_FAILED",
      readFailure: "interrupted",
    });

    expect(await readings().listInProgress()).toEqual([]);
  });
});
