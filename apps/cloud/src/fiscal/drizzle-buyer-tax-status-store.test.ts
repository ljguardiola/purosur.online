import { recordBuyerTaxStatusSet } from "@purosur/domain/fiscal/use-cases";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buyerTaxStatusSets, changes } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleBuyerTaxStatusStore } from "./drizzle-buyer-tax-status-store.js";

const OPTION_A = { code: 901, description: "Condicion de prueba A", invoiceClass: "A" };
const OPTION_B = { code: 902, description: "Condicion de prueba B", invoiceClass: "C" };

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

function record(options: (typeof OPTION_A)[]) {
  return recordBuyerTaxStatusSet({ store: new DrizzleBuyerTaxStatusStore(db) }, { options });
}

describe("DrizzleBuyerTaxStatusStore", () => {
  it("answers no current set while none exists", async () => {
    const store = new DrizzleBuyerTaxStatusStore(db);

    const current = await store.transaction((tx) => tx.lockCurrentBuyerTaxStatusSet());

    expect(current).toBeUndefined();
  });

  it("answers the set with the highest version, with its options in order", async () => {
    await db.insert(buyerTaxStatusSets).values([
      { paramsVersion: 2, options: [OPTION_B, OPTION_A] },
      { paramsVersion: 1, options: [OPTION_A] },
    ]);
    const store = new DrizzleBuyerTaxStatusStore(db);

    const current = await store.transaction((tx) => tx.lockCurrentBuyerTaxStatusSet());

    expect(current).toEqual({ paramsVersion: 2, options: [OPTION_B, OPTION_A] });
  });

  it("appends each different set as the next version, keeping every previous one", async () => {
    await record([OPTION_A]);
    await record([OPTION_A, OPTION_B]);

    const stored = await db
      .select({
        paramsVersion: buyerTaxStatusSets.paramsVersion,
        options: buyerTaxStatusSets.options,
      })
      .from(buyerTaxStatusSets)
      .orderBy(asc(buyerTaxStatusSets.paramsVersion));
    expect(stored).toEqual([
      { paramsVersion: 1, options: [OPTION_A] },
      { paramsVersion: 2, options: [OPTION_A, OPTION_B] },
    ]);
  });

  it("records nothing for the set that is already current", async () => {
    await record([OPTION_A, OPTION_B]);
    const loggedBefore = await db.select().from(changes);

    const outcome = await record([OPTION_B, OPTION_A]);

    expect(outcome).toEqual({ kind: "unchanged", paramsVersion: 1 });
    expect(await db.select().from(buyerTaxStatusSets)).toHaveLength(1);
    expect(await db.select().from(changes)).toHaveLength(loggedBefore.length);
  });

  it("logs each new set as an insert at the id of the set, carrying its version", async () => {
    const loggedBefore = await db.select().from(changes);

    await record([OPTION_A]);
    await record([OPTION_A, OPTION_B]);

    const sets = await db
      .select()
      .from(buyerTaxStatusSets)
      .orderBy(asc(buyerTaxStatusSets.paramsVersion));
    const logged = (await db.select().from(changes).orderBy(asc(changes.changeSeq))).slice(
      loggedBefore.length,
    );
    expect(logged).toMatchObject([
      { entity: "buyer_tax_status_set", entityId: sets[0]?.id, version: 1, op: "insert" },
      { entity: "buyer_tax_status_set", entityId: sets[1]?.id, version: 2, op: "insert" },
    ]);
  });

  it("leaves nothing behind when the operation fails after recording", async () => {
    const store = new DrizzleBuyerTaxStatusStore(db);
    const loggedBefore = await db.select().from(changes);

    await expect(
      store.transaction(async (tx) => {
        await tx.recordBuyerTaxStatusSet({ paramsVersion: 1, options: [OPTION_A] });
        throw new Error("the operation failed");
      }),
    ).rejects.toThrow("the operation failed");

    expect(await db.select().from(buyerTaxStatusSets)).toEqual([]);
    expect(await db.select().from(changes)).toHaveLength(loggedBefore.length);
  });
});
