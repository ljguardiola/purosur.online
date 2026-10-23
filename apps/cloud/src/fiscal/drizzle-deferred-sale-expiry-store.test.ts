import { deferredSaleRegularizationTask } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deferredSales, fiscalTasks } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleDeferredSaleExpiryStore } from "./drizzle-deferred-sale-expiry-store.js";
import { insertDeferredSaleRow } from "./test-support/deferred-sale-fixtures.js";

const NOW = new Date("2026-10-10T03:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let installation: Awaited<ReturnType<typeof insertEnrolledInstallation>>;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  installation = await insertEnrolledInstallation(db, { now: NOW });
});

function store() {
  return new DrizzleDeferredSaleExpiryStore(db);
}

describe("DrizzleDeferredSaleExpiryStore", () => {
  it("locks the pending deferred sales that occurred before an instant, oldest first", async () => {
    const newer = await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: new Date("2026-09-02T12:00:00.000Z"),
    });
    const older = await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      total: 9900,
      shortCode: "AAAA2222",
    });
    await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: new Date("2026-09-03T12:00:00.000Z"),
    });
    await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      state: "satisfied",
      satisfiedAt: NOW,
    });

    const locked = await store().transaction((transaction) =>
      transaction.lockPendingDeferredSalesOccurredBefore(new Date("2026-09-03T00:00:00.000Z")),
    );

    expect(locked).toEqual([
      {
        id: older.id,
        saleId: older.saleId,
        registerId: installation.registerId,
        locationId: installation.locationId,
        occurredAt: older.occurredAt,
        total: 9900,
        shortCode: "AAAA2222",
      },
      {
        id: newer.id,
        saleId: newer.saleId,
        registerId: installation.registerId,
        locationId: installation.locationId,
        occurredAt: newer.occurredAt,
        total: 4800,
        shortCode: "7KQ4M2P9",
      },
    ]);
  });

  it("expires a deferred sale and opens the regularization task naming its date, total and short code", async () => {
    const sale = await insertDeferredSaleRow(db, installation);
    const task = deferredSaleRegularizationTask(
      {
        id: sale.id,
        saleId: sale.saleId,
        registerId: sale.registerId,
        locationId: sale.locationId,
        occurredAt: sale.occurredAt,
        total: sale.total,
        shortCode: sale.shortCode,
      },
      NOW,
    );

    await store().transaction((transaction) => transaction.recordExpiry(sale.id, task));

    const [expired] = await db.select().from(deferredSales).where(eq(deferredSales.id, sale.id));
    expect(expired).toMatchObject({ state: "expired", expiredAt: NOW });
    const [row] = await db.select().from(fiscalTasks);
    expect(row).toMatchObject({
      kind: "deferred_sale_expired",
      registerId: sale.registerId,
      deferredSaleId: sale.id,
      pointOfSale: null,
      documentType: null,
      number: null,
      state: "open",
      createdAt: NOW,
      closedAt: null,
      reason: {
        saleOccurredAt: sale.occurredAt.toISOString(),
        total: 4800,
        shortCode: "7KQ4M2P9",
      },
    });
  });

  it("leaves the deferred sale pending when its expiry cannot be recorded", async () => {
    const sale = await insertDeferredSaleRow(db, installation);
    const task = deferredSaleRegularizationTask(
      {
        id: sale.id,
        saleId: sale.saleId,
        registerId: sale.registerId,
        locationId: sale.locationId,
        occurredAt: sale.occurredAt,
        total: sale.total,
        shortCode: sale.shortCode,
      },
      NOW,
    );

    await expect(
      store().transaction(async (transaction) => {
        await transaction.recordExpiry(sale.id, task);
        throw new Error("interrupted");
      }),
    ).rejects.toThrow("interrupted");

    const [row] = await db.select().from(deferredSales);
    expect(row).toMatchObject({ state: "pending", expiredAt: null });
    expect(await db.select().from(fiscalTasks)).toEqual([]);
  });
});
