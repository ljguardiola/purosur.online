import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import { discounts, products } from "./schema.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

const DISCOUNTS_MIGRATION_TAG_SUFFIX = "_discounts";

async function discountsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    DISCOUNTS_MIGRATION_TAG_SUFFIX,
    "test setup: no discounts migration in the journal",
  );
}

describe("the discounts migration applied to a database that already holds products", {
  timeout: 30_000,
}, () => {
  it("leaves existing products unchanged, with no discounts", async () => {
    const folder = await mkdtemp(join(tmpdir(), "discounts-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await discountsEntry());

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: categoryRows } = await client.query<{ id: string }>(
      "insert into categories (name) values ($1) returning id",
      ["Almacén"],
    );
    const category = categoryRows[0];
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const { rows: productRows } = await client.query<{ id: string }>(
      "insert into products (name, category_id, sale_unit) values ($1, $2, $3) returning id",
      ["Miel pura de abeja 1 kg", category.id, "UNIT"],
    );
    const seededProduct = productRows[0];
    if (!seededProduct) {
      throw new Error("test setup: seeding the product returned no row");
    }

    await addMigrationEntry(folder, await discountsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const db = drizzle(client);
    expect(await db.select().from(products).where(eq(products.id, seededProduct.id))).toMatchObject(
      [
        {
          id: seededProduct.id,
          name: "Miel pura de abeja 1 kg",
          categoryId: category.id,
          saleUnit: "UNIT",
          active: true,
        },
      ],
    );
    expect(await db.select({ id: discounts.id }).from(discounts)).toEqual([]);
  });
});
