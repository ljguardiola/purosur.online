import type { DiscountFields, DiscountStoreTransaction } from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertProductWithTags,
  insertTag,
} from "../catalog/test-support/catalog-route-fixtures.js";
import { categories, discounts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleDiscountStore } from "./drizzle-discount-store.js";

const NEVER_STORED_ID = "00000000-0000-0000-0000-000000000000";

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

function inTransaction<TOutcome>(
  work: (tx: DiscountStoreTransaction) => Promise<TOutcome>,
): Promise<TOutcome> {
  return new DrizzleDiscountStore(db).transaction(work);
}

async function insertCategory(name = "Almacén"): Promise<string> {
  const [category] = await db.insert(categories).values({ name }).returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}

function fieldsAimedAt(target: DiscountFields["target"]): DiscountFields {
  return {
    name: "Martes de infusiones",
    benefit: { kind: "PERCENT_OFF", percent: 10 },
    target,
    validFrom: "2026-10-01",
    validTo: "2026-10-31",
    weekdays: [2, 4],
    active: true,
    version: 1,
  };
}

describe("locking the target a discount points at", () => {
  it("locks a category, a tag and a product that exist and are active", async () => {
    const categoryId = await insertCategory();
    const tag = await insertTag(db, { name: "Vegano" });
    const product = await insertProductWithTags(db, { name: "Yerba", tagIds: [] });

    const outcomes = await inTransaction(async (tx) => [
      await tx.lockAssignableTarget({ kind: "CATEGORY", id: categoryId }),
      await tx.lockAssignableTarget({ kind: "TAG", id: tag.id }),
      await tx.lockAssignableTarget({ kind: "PRODUCT", id: product.id }),
    ]);

    expect(outcomes).toEqual([
      { kind: "locked", name: "Almacén", saleUnit: null },
      { kind: "locked", name: "Vegano", saleUnit: null },
      { kind: "locked", name: "Yerba", saleUnit: "UNIT" },
    ]);
  });

  it("reports that a product is sold by weight", async () => {
    const product = await insertProductWithTags(db, {
      name: "Queso cremoso",
      tagIds: [],
      saleUnit: "KG",
    });

    const outcome = await inTransaction((tx) =>
      tx.lockAssignableTarget({ kind: "PRODUCT", id: product.id }),
    );

    expect(outcome).toEqual({ kind: "locked", name: "Queso cremoso", saleUnit: "KG" });
  });

  it("answers not found for a target that does not exist", async () => {
    const outcomes = await inTransaction(async (tx) => [
      await tx.lockAssignableTarget({ kind: "CATEGORY", id: NEVER_STORED_ID }),
      await tx.lockAssignableTarget({ kind: "TAG", id: NEVER_STORED_ID }),
      await tx.lockAssignableTarget({ kind: "PRODUCT", id: NEVER_STORED_ID }),
    ]);

    expect(outcomes).toEqual([{ kind: "not_found" }, { kind: "not_found" }, { kind: "not_found" }]);
  });

  it("answers not found for a target whose id is malformed", async () => {
    const outcomes = await inTransaction(async (tx) => [
      await tx.lockAssignableTarget({ kind: "CATEGORY", id: "not-a-uuid" }),
      await tx.lockAssignableTarget({ kind: "TAG", id: "not-a-uuid" }),
      await tx.lockAssignableTarget({ kind: "PRODUCT", id: "not-a-uuid" }),
    ]);

    expect(outcomes).toEqual([{ kind: "not_found" }, { kind: "not_found" }, { kind: "not_found" }]);
  });

  it("answers not found for an inactive tag and an inactive product", async () => {
    const tag = await insertTag(db, { name: "Kosher", active: false });
    const product = await insertProductWithTags(db, { name: "Yerba", tagIds: [], active: false });

    const outcomes = await inTransaction(async (tx) => [
      await tx.lockAssignableTarget({ kind: "TAG", id: tag.id }),
      await tx.lockAssignableTarget({ kind: "PRODUCT", id: product.id }),
    ]);

    expect(outcomes).toEqual([{ kind: "not_found" }, { kind: "not_found" }]);
  });
});

describe("storing a discount", () => {
  it.each([
    ["CATEGORY", async () => insertCategory()],
    ["TAG", async () => (await insertTag(db, { name: "Vegano" })).id],
    ["PRODUCT", async () => (await insertProductWithTags(db, { name: "Yerba", tagIds: [] })).id],
  ] as const)("keeps everything it was given, aimed at a %s", async (kind, targetId) => {
    const target = { kind, id: await targetId() };
    const fields = fieldsAimedAt(target);

    const { id } = await inTransaction((tx) => tx.insertDiscount(fields));

    expect(await inTransaction((tx) => tx.lockDiscount(id))).toEqual({
      kind: "locked",
      discount: fields,
    });
  });

  it("replaces what an edit changes and keeps the rest", async () => {
    const categoryId = await insertCategory();
    const tag = await insertTag(db, { name: "Vegano" });
    const { id } = await inTransaction((tx) =>
      tx.insertDiscount(fieldsAimedAt({ kind: "CATEGORY", id: categoryId })),
    );
    const edited: DiscountFields = {
      name: "Semana vegana",
      benefit: { kind: "PERCENT_OFF", percent: 25 },
      target: { kind: "TAG", id: tag.id },
      validFrom: "2026-11-01",
      validTo: "2026-11-07",
      weekdays: [],
      active: false,
      version: 2,
    };

    await inTransaction((tx) => tx.updateDiscount(id, edited));

    expect(await inTransaction((tx) => tx.lockDiscount(id))).toEqual({
      kind: "locked",
      discount: edited,
    });
    const rows = await db.select().from(discounts).where(eq(discounts.id, id));
    expect(rows).toMatchObject([{ categoryId: null, tagId: tag.id, productId: null }]);
  });
});

describe("storing a buy-N-pay-M discount", () => {
  it("keeps its quantities", async () => {
    const product = await insertProductWithTags(db, { name: "Alfajor", tagIds: [] });
    const fields: DiscountFields = {
      ...fieldsAimedAt({ kind: "PRODUCT", id: product.id }),
      benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
    };

    const { id } = await inTransaction((tx) => tx.insertDiscount(fields));

    expect(await inTransaction((tx) => tx.lockDiscount(id))).toEqual({
      kind: "locked",
      discount: fields,
    });
    const rows = await db.select().from(discounts).where(eq(discounts.id, id));
    expect(rows).toMatchObject([{ kind: "BUY_N_PAY_M", percent: null, buyQty: 3, payQty: 2 }]);
  });

  it("drops the percent when an edit switches a discount to buy-N-pay-M, and the quantities when it switches back", async () => {
    const product = await insertProductWithTags(db, { name: "Alfajor", tagIds: [] });
    const percentOff = fieldsAimedAt({ kind: "PRODUCT", id: product.id });
    const { id } = await inTransaction((tx) => tx.insertDiscount(percentOff));

    await inTransaction((tx) =>
      tx.updateDiscount(id, {
        ...percentOff,
        benefit: { kind: "BUY_N_PAY_M", buyQty: 2, payQty: 1 },
        version: 2,
      }),
    );
    expect(await db.select().from(discounts).where(eq(discounts.id, id))).toMatchObject([
      { percent: null, buyQty: 2, payQty: 1 },
    ]);

    await inTransaction((tx) => tx.updateDiscount(id, { ...percentOff, version: 3 }));
    expect(await db.select().from(discounts).where(eq(discounts.id, id))).toMatchObject([
      { percent: 10, buyQty: null, payQty: null },
    ]);
  });
});

describe("locking a discount", () => {
  it("answers not found for an id that was never stored or is malformed", async () => {
    const outcomes = await inTransaction(async (tx) => [
      await tx.lockDiscount(NEVER_STORED_ID),
      await tx.lockDiscount("not-a-uuid"),
    ]);

    expect(outcomes).toEqual([{ kind: "not_found" }, { kind: "not_found" }]);
  });
});
