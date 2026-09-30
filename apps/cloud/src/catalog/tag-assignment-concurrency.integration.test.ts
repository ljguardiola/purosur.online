import { randomUUID } from "node:crypto";
import {
  createCategory,
  createProduct,
  createTag,
  deactivateTag,
} from "@purosur/domain/catalog/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productTags, tags } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

// PGlite serializes every query on one connection, so racing writes can only interleave on a real
// Postgres pool; each test pins that interleaving by holding the tag's row lock until both queue.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("tag_assignment_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function tagAndLeafCategory() {
  const store = new DrizzleCatalogStore(db);
  const tag = await createTag(store, { name: `Sin TACC ${randomUUID()}` });
  const category = await createCategory(store, { name: `Almacén ${randomUUID()}`, parentId: null });
  if (tag.kind !== "created" || category.kind !== "created") {
    throw new Error("test setup: expected the tag and the category to be created");
  }
  return { tagId: tag.tag.id, categoryId: category.category.id };
}

function holdTagRowLock(tagId: string) {
  return (connection: postgres.ReservedSql) =>
    connection`select id from tags where id = ${tagId} for update`;
}

function newProductOf(tagId: string, categoryId: string) {
  return () =>
    createProduct(new DrizzleCatalogStore(db), {
      name: "Galletitas",
      categoryId,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: [randomUUID()],
      tagIds: [tagId],
      netContent: null,
    });
}

describe("creating a product with a tag while the tag is deactivated, on a real Postgres", () => {
  it("refuses the product when the deactivation commits first", async () => {
    const { tagId, categoryId } = await tagAndLeafCategory();

    const [deactivation, creation] = await runQueuedBehindHeldLock(
      sql,
      holdTagRowLock(tagId),
      () => deactivateTag(new DrizzleCatalogStore(db), tagId),
      newProductOf(tagId, categoryId),
    );

    expect(deactivation.kind).toBe("deactivated");
    expect(creation.kind).toBe("tag_inactive");
    expect(await db.select().from(productTags).where(eq(productTags.tagId, tagId))).toEqual([]);
  });

  it("keeps the tag on a product created before the deactivation commits", async () => {
    const { tagId, categoryId } = await tagAndLeafCategory();

    const [creation, deactivation] = await runQueuedBehindHeldLock(
      sql,
      holdTagRowLock(tagId),
      newProductOf(tagId, categoryId),
      () => deactivateTag(new DrizzleCatalogStore(db), tagId),
    );

    expect(creation.kind).toBe("created");
    expect(deactivation.kind).toBe("deactivated");
    expect(await db.select().from(productTags).where(eq(productTags.tagId, tagId))).toHaveLength(1);
    expect(await db.select().from(tags).where(eq(tags.id, tagId))).toMatchObject([
      { active: false },
    ]);
  });
});

describe("creating two products with the same tags listed in opposite orders at once, on a real Postgres", () => {
  it("creates both, with neither waiting on the other in a deadlock", async () => {
    const first = await tagAndLeafCategory();
    const second = await tagAndLeafCategory();
    const lowerTagId = first.tagId < second.tagId ? first.tagId : second.tagId;
    const higherTagId = lowerTagId === first.tagId ? second.tagId : first.tagId;
    const productWith = (categoryId: string, tagIds: string[]) => () =>
      createProduct(new DrizzleCatalogStore(db), {
        name: "Galletitas",
        categoryId,
        brandId: null,
        saleUnit: "UNIT",
        barcodes: [randomUUID()],
        tagIds,
        netContent: null,
      });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      holdTagRowLock(lowerTagId),
      productWith(first.categoryId, [lowerTagId, higherTagId]),
      productWith(second.categoryId, [higherTagId, lowerTagId]),
    );

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(["created", "created"]);
  });
});
