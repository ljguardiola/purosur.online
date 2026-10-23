import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePendingDeferredSaleReader } from "./drizzle-pending-deferred-sale-reader.js";
import { insertDeferredSaleRow } from "./test-support/deferred-sale-fixtures.js";

const NOW = new Date("2026-10-10T03:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

describe("DrizzlePendingDeferredSaleReader pendingDeferredSales", () => {
  it("lists the pending deferred sales with the location of their register", async () => {
    const installation = await insertEnrolledInstallation(db, { now: NOW });
    const pending = await insertDeferredSaleRow(db, installation);
    await insertDeferredSaleRow(db, { ...installation, state: "satisfied", satisfiedAt: NOW });
    await insertDeferredSaleRow(db, { ...installation, state: "expired", expiredAt: NOW });
    await insertDeferredSaleRow(db, { ...installation, state: "cancelled", cancelledAt: NOW });

    const listed = await new DrizzlePendingDeferredSaleReader(db).pendingDeferredSales();

    expect(listed).toEqual([
      {
        id: pending.id,
        saleId: pending.saleId,
        registerId: installation.registerId,
        locationId: installation.locationId,
        occurredAt: pending.occurredAt,
        total: 4800,
        shortCode: "7KQ4M2P9",
      },
    ]);
  });
});
