import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../platform/db/schema.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAiCostReportReader } from "./drizzle-ai-cost-report-reader.js";
import { insertAiCall } from "./test-support/ai-call-fixtures.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import { insertPriceList, insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

const october = { from: "2026-10-01", to: "2026-10-31" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let supplierId: string;
let listId: string;

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
  supplierId = await insertSupplier(db, { actorId, name: "Distribuidora Sur" });
  listId = await insertPriceList(db, { supplierId, locationId, actorId });
});

const reader = () => new DrizzleAiCostReportReader(db);

describe("DrizzleAiCostReportReader.recordedCalls", () => {
  it("answers each call with its day, purpose, cost, supplier and the person who started it", async () => {
    await insertAiCall(db, {
      listId,
      supplierId,
      locationId,
      actorId,
      purpose: "LINK_PROPOSAL",
      occurredOn: "2026-10-12",
      costNanoUsd: 2_500_000,
    });

    expect(await reader().recordedCalls({ locationId, range: october })).toEqual([
      {
        purpose: "LINK_PROPOSAL",
        occurredOn: "2026-10-12",
        costNanoUsd: 2_500_000,
        supplierId,
        supplierName: "Distribuidora Sur",
        personId: actorId,
        personName: "Ada Lucero",
      },
    ]);
  });

  it("answers the calls of failed, cut short and unpriced ones too", async () => {
    const seed = { listId, supplierId, locationId, actorId };
    await insertAiCall(db, { ...seed, outcome: "failed", costNanoUsd: 0 });
    await insertAiCall(db, { ...seed, outcome: "cut_short" });
    await insertAiCall(db, { ...seed, costNanoUsd: null });

    expect(await reader().recordedCalls({ locationId, range: october })).toHaveLength(3);
  });

  it("answers the calls of both ends of the range and none outside it", async () => {
    const seed = { listId, supplierId, locationId, actorId };
    for (const occurredOn of ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01"]) {
      await insertAiCall(db, { ...seed, occurredOn });
    }

    const calls = await reader().recordedCalls({ locationId, range: october });

    expect(calls.map((call) => call.occurredOn).sort()).toEqual(["2026-10-01", "2026-10-31"]);
  });

  it("answers the calls of the branch asked for and not those of another", async () => {
    const otherLocationId = await insertLocation(db);
    const otherListId = await insertPriceList(db, {
      supplierId,
      locationId: otherLocationId,
      actorId,
    });
    await insertAiCall(db, {
      listId: otherListId,
      supplierId,
      locationId: otherLocationId,
      actorId,
    });

    expect(await reader().recordedCalls({ locationId, range: october })).toEqual([]);
  });

  it("names a person by the name they have now", async () => {
    await insertAiCall(db, { listId, supplierId, locationId, actorId });
    await db.update(users).set({ firstName: "Ada Montes" }).where(eq(users.id, actorId));

    const [call] = await reader().recordedCalls({ locationId, range: october });

    expect(call?.personName).toBe("Ada Montes");
  });
});
