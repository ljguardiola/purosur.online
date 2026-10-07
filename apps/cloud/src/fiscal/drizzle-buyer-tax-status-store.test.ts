import { recordBuyerTaxStatusSet } from "@purosur/domain/fiscal/use-cases";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buyerTaxStatusSets, changes } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleBuyerTaxStatusStore } from "./drizzle-buyer-tax-status-store.js";

const a = { code: 901, description: "Condicion de prueba A", invoiceClass: "A" };
const b = { code: 902, description: "Condicion de prueba B", invoiceClass: "C" };

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

describe("DrizzleBuyerTaxStatusStore", () => {
  it("answers no current set while none exists", async () => {
    const store = new DrizzleBuyerTaxStatusStore(db);

    const current = await store.transaction((tx) => tx.lockCurrentBuyerTaxStatusSet());

    expect(current).toBeUndefined();
  });

  it("answers the set with the highest version, whatever order they were recorded in", async () => {
    await db.insert(buyerTaxStatusSets).values({ paramsVersion: 2, options: [a, b] });
    await db.insert(buyerTaxStatusSets).values({ paramsVersion: 1, options: [a] });
    const store = new DrizzleBuyerTaxStatusStore(db);

    const current = await store.transaction((tx) => tx.lockCurrentBuyerTaxStatusSet());

    expect(current).toEqual({ paramsVersion: 2, options: [a, b] });
  });

  it("appends the set as a new version, keeping the earlier ones", async () => {
    await db.insert(buyerTaxStatusSets).values({ paramsVersion: 1, options: [a] });

    await recordBuyerTaxStatusSet(
      { store: new DrizzleBuyerTaxStatusStore(db) },
      { options: [a, b] },
    );

    const stored = await db
      .select({
        paramsVersion: buyerTaxStatusSets.paramsVersion,
        options: buyerTaxStatusSets.options,
      })
      .from(buyerTaxStatusSets)
      .orderBy(asc(buyerTaxStatusSets.paramsVersion));
    expect(stored).toEqual([
      { paramsVersion: 1, options: [a] },
      { paramsVersion: 2, options: [a, b] },
    ]);
  });

  it("logs the new set as an insert at its own id, for every register", async () => {
    const before = await db.select({ seq: changes.changeSeq }).from(changes);

    await recordBuyerTaxStatusSet({ store: new DrizzleBuyerTaxStatusStore(db) }, { options: [a] });

    const [recorded] = await db.select({ id: buyerTaxStatusSets.id }).from(buyerTaxStatusSets);
    const logged = (await db.select().from(changes).orderBy(asc(changes.changeSeq))).slice(
      before.length,
    );
    expect(logged).toMatchObject([
      {
        entity: "buyer_tax_status_set",
        entityId: recorded?.id,
        version: 1,
        op: "insert",
        priceListId: null,
        locationId: null,
      },
    ]);
  });

  it("logs nothing when the set is unchanged", async () => {
    const store = new DrizzleBuyerTaxStatusStore(db);
    await recordBuyerTaxStatusSet({ store }, { options: [a] });
    const before = await db.select({ seq: changes.changeSeq }).from(changes);

    await recordBuyerTaxStatusSet({ store }, { options: [a] });

    expect(await db.select({ seq: changes.changeSeq }).from(changes)).toHaveLength(before.length);
  });
});
