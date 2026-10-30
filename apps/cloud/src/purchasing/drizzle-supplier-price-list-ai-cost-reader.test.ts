import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supplierPriceLists } from "../platform/db/schema.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListAiCostReader } from "./drizzle-supplier-price-list-ai-cost-reader.js";
import { insertAiCall } from "./test-support/ai-call-fixtures.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import { insertPriceList, insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let supplierId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
  supplierId = await insertSupplier(db, { actorId });
});

const reader = () => new DrizzleSupplierPriceListAiCostReader(db);

describe("DrizzleSupplierPriceListAiCostReader.callsOfList", () => {
  it("answers the purpose and cost of each call recorded for the list, a cut short one and an unpriced one included", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });
    const seed = { listId, supplierId, locationId, actorId };
    await insertAiCall(db, { ...seed, costNanoUsd: 4_000_000 });
    await insertAiCall(db, { ...seed, outcome: "cut_short", costNanoUsd: 1_500_000 });
    await insertAiCall(db, { ...seed, purpose: "LINK_PROPOSAL", costNanoUsd: null });

    const list = await reader().callsOfList(listId);

    expect(list?.recordedFromStart).toBe(true);
    expect(list?.calls).toHaveLength(3);
    expect(list?.calls).toContainEqual({ purpose: "READING", costNanoUsd: 4_000_000 });
    expect(list?.calls).toContainEqual({ purpose: "READING", costNanoUsd: 1_500_000 });
    expect(list?.calls).toContainEqual({ purpose: "LINK_PROPOSAL", costNanoUsd: null });
  });

  it("answers no calls for a list nothing was recorded for", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    expect(await reader().callsOfList(listId)).toEqual({ recordedFromStart: true, calls: [] });
  });

  it("answers the calls of the list asked for and no other", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });
    const otherListId = await insertPriceList(db, { supplierId, locationId, actorId });
    await insertAiCall(db, { listId: otherListId, supplierId, locationId, actorId });

    expect(await reader().callsOfList(listId)).toEqual({ recordedFromStart: true, calls: [] });
  });

  it("says when the list's AI use began before its calls were recorded", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });
    await db
      .update(supplierPriceLists)
      .set({ aiCallsRecordedFromStart: false })
      .where(eq(supplierPriceLists.id, listId));

    expect(await reader().callsOfList(listId)).toEqual({ recordedFromStart: false, calls: [] });
  });

  it("answers undefined for a list that does not exist", async () => {
    expect(await reader().callsOfList("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it("answers the calls of a list of any branch", async () => {
    const otherLocationId = await insertLocation(db);
    const listId = await insertPriceList(db, {
      supplierId,
      locationId: otherLocationId,
      actorId,
    });
    await insertAiCall(db, { listId, supplierId, locationId: otherLocationId, actorId });

    expect(await reader().callsOfList(listId)).toEqual({
      recordedFromStart: true,
      calls: [{ purpose: "READING", costNanoUsd: 4_000_000 }],
    });
  });
});
