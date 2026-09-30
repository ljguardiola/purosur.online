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

    expect(outcomes).toEqual([{ kind: "locked" }, { kind: "locked" }, { kind: "locked" }]);
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

describe("locking a discount", () => {
  it("answers not found for an id that was never stored or is malformed", async () => {
    const outcomes = await inTransaction(async (tx) => [
      await tx.lockDiscount(NEVER_STORED_ID),
      await tx.lockDiscount("not-a-uuid"),
    ]);

    expect(outcomes).toEqual([{ kind: "not_found" }, { kind: "not_found" }]);
  });
});
