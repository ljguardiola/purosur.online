import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./migration-journal-test-helpers.js";
import { products } from "./schema.js";
import { migrateFreshDatabase } from "./test-database-snapshot.js";

const NET_CONTENT_MIGRATION_TAG_SUFFIX = "_product_net_content";

async function netContentEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    NET_CONTENT_MIGRATION_TAG_SUFFIX,
    "test setup: no product_net_content migration in the journal",
  );
}

async function migrationsFolderBeforeNetContent(destFolder: string): Promise<void> {
  await migrationsFolderBefore(destFolder, await netContentEntry());
}

/** Adds this feature's real, already hand-edited product_net_content migration to the folder. */
async function addNetContentMigration(destFolder: string): Promise<void> {
  await addMigrationEntry(destFolder, await netContentEntry());
}

describe("the product_net_content migration applied to a database that already holds products", () => {
  it("leaves existing products unchanged, with no net content", async () => {
    const folder = await mkdtemp(join(tmpdir(), "product-net-content-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBeforeNetContent(folder);

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: categoryRows } = await client.query<{ id: string }>(
      "insert into categories (name) values ($1) returning id",
      ["Macetas"],
    );
    const category = categoryRows[0];
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const { rows: productRows } = await client.query<{ id: string }>(
      "insert into products (name, category_id, sale_unit) values ($1, $2, $3) returning id",
      ["Maceta 20cm", category.id, "UNIT"],
    );
    const seededProduct = productRows[0];
    if (!seededProduct) {
      throw new Error("test setup: seeding the product returned no row");
    }

    await addNetContentMigration(folder);
    await migrate(drizzle(client), { migrationsFolder: folder });

    const db = drizzle(client);
    const rows = await db.select().from(products).where(eq(products.id, seededProduct.id));

    expect(rows).toMatchObject([
      {
        id: seededProduct.id,
        name: "Maceta 20cm",
        categoryId: category.id,
        saleUnit: "UNIT",
        active: true,
        netContentQuantity: null,
        netContentUnit: null,
      },
    ]);
  });
});
