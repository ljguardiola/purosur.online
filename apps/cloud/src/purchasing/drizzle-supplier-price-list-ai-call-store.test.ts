import type { AiCallRecord } from "@purosur/domain/purchasing/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supplierPriceListAiCalls } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListAiCallStore } from "./drizzle-supplier-price-list-ai-call-store.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import { insertPriceList, insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-10-12T15:00:00.000Z");

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

function record(listId: string, rowId: string | null = null): AiCallRecord {
  return {
    purpose: "LINK_PROPOSAL",
    listId,
    rowId,
    actorId,
    occurredAt: NOW,
    occurredOn: "2026-10-12",
    model: "claude-sonnet-5-5",
    inputTokens: 500,
    outputTokens: 20,
    cacheWriteTokens: 0,
    cacheReadTokens: 400,
    outcome: "completed",
    costNanoUsd: 1_100_000,
  };
}

describe("DrizzleSupplierPriceListAiCallStore.record", () => {
  it("writes each record with the supplier and the branch of its list", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    await new DrizzleSupplierPriceListAiCallStore(db).record([record(listId), record(listId)]);

    const calls = await db.select().from(supplierPriceListAiCalls);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      listId,
      supplierId,
      locationId,
      actorId,
      purpose: "LINK_PROPOSAL",
      occurredOn: "2026-10-12",
      cacheReadTokens: 400,
      costNanoUsd: 1_100_000,
    });
  });

  it("writes none of the records when one of them cannot be written", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    await expect(
      new DrizzleSupplierPriceListAiCallStore(db).record([
        record(listId),
        record("00000000-0000-4000-8000-000000000000"),
      ]),
    ).rejects.toThrow();

    expect(await db.select().from(supplierPriceListAiCalls)).toEqual([]);
  });

  it("writes nothing for no record", async () => {
    await new DrizzleSupplierPriceListAiCallStore(db).record([]);

    expect(await db.select().from(supplierPriceListAiCalls)).toEqual([]);
  });
});
