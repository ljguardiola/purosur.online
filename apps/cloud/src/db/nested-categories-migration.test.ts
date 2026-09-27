import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { categories, products } from "./schema.js";
import { MIGRATIONS_FOLDER, migrateFreshDatabase } from "./test-database-snapshot.js";

const NESTED_CATEGORIES_MIGRATION_TAG_SUFFIX = "_nested_categories";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

async function readRealJournal(): Promise<Journal> {
  const raw = await readFile(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8");
  return JSON.parse(raw) as Journal;
}

async function nestedCategoriesEntry(): Promise<JournalEntry> {
  const journal = await readRealJournal();
  const entry = journal.entries.find((candidate) =>
    candidate.tag.endsWith(NESTED_CATEGORIES_MIGRATION_TAG_SUFFIX),
  );
  if (!entry) {
    throw new Error("test setup: no nested_categories migration in the journal");
  }
  return entry;
}

// Only `_journal.json` and the migration `.sql` files matter to drizzle's runtime migrator —
// unlike `drizzle-kit generate`, it never reads the per-migration snapshot files.
async function migrationsFolderBeforeNestedCategories(destFolder: string): Promise<void> {
  await mkdir(join(destFolder, "meta"), { recursive: true });
  const journal = await readRealJournal();
  const { idx } = await nestedCategoriesEntry();
  const entriesBefore = journal.entries.filter((entry) => entry.idx < idx);
  await writeFile(
    join(destFolder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: entriesBefore }),
  );
  for (const entry of entriesBefore) {
    await copyFile(
      join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
      join(destFolder, `${entry.tag}.sql`),
    );
  }
}

async function addNestedCategoriesMigration(destFolder: string): Promise<void> {
  const journalPath = join(destFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
  const entry = await nestedCategoriesEntry();
  journal.entries.push(entry);
  await writeFile(journalPath, JSON.stringify(journal));
  await copyFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(destFolder, `${entry.tag}.sql`));
}

interface SeededCategory {
  id: string;
  name: string;
}

async function insertPreMigrationCategory(
  client: { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  name: string,
  version = 1,
): Promise<SeededCategory> {
  const { rows } = await client.query<SeededCategory>(
    "insert into categories (name, version) values ($1, $2) returning id, name",
    [name, version],
  );
  const category = rows[0];
  if (!category) {
    throw new Error("test setup: seeding a category returned no row");
  }
  return category;
}

async function insertPreMigrationProduct(
  client: { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  categoryId: string,
  name: string,
  active: boolean,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into products (name, category_id, sale_unit, active)
     values ($1, $2, 'UNIT', $3)
     returning id`,
    [name, categoryId, active],
  );
  const product = rows[0];
  if (!product) {
    throw new Error("test setup: seeding a product returned no row");
  }
  return product.id;
}

describe("the nested_categories migration's effect on existing categories and products", {
  timeout: 30_000,
}, () => {
  it(
    "keeps every existing category top-level, keeps its products, and enforces the new " +
      "parent-scoped name uniqueness on the migrated data",
    async () => {
      const folder = await mkdtemp(join(tmpdir(), "nested-categories-migration-"));
      onTestFinished(() => rm(folder, { recursive: true, force: true }));
      await migrationsFolderBeforeNestedCategories(folder);

      const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
      onTestFinished(() => client.close());

      // Names must be distinct: the pre-migration, table-wide `categories_name_lower_key` already
      // forbids a case-variant duplicate here, same as the parent-scoped index will after migrating.
      const bebidas = await insertPreMigrationCategory(client, "Bebidas");
      const lacteos = await insertPreMigrationCategory(client, "Lácteos", 3);
      const limpieza = await insertPreMigrationCategory(client, "Limpieza");

      const activeProductId = await insertPreMigrationProduct(
        client,
        bebidas.id,
        "Agua 1.5L",
        true,
      );
      const inactiveProductId = await insertPreMigrationProduct(
        client,
        lacteos.id,
        "Leche descremada 1L",
        false,
      );

      await addNestedCategoriesMigration(folder);
      await migrate(drizzle(client), { migrationsFolder: folder });

      const db = drizzle(client);
      const migratedCategories = (
        await db
          .select({
            id: categories.id,
            name: categories.name,
            version: categories.version,
            parentId: categories.parentId,
          })
          .from(categories)
      ).sort((a, b) => a.name.localeCompare(b.name, "es"));

      expect(migratedCategories).toEqual([
        { id: bebidas.id, name: "Bebidas", version: 1, parentId: null },
        { id: lacteos.id, name: "Lácteos", version: 3, parentId: null },
        { id: limpieza.id, name: "Limpieza", version: 1, parentId: null },
      ]);

      const migratedProducts = await db
        .select({ id: products.id, categoryId: products.categoryId, active: products.active })
        .from(products)
        .orderBy(asc(products.name));
      expect(migratedProducts).toEqual([
        { id: activeProductId, categoryId: bebidas.id, active: true },
        { id: inactiveProductId, categoryId: lacteos.id, active: false },
      ]);

      await expect(
        client.query("insert into categories (name) values ($1)", ["BEBIDAS"]),
      ).rejects.toMatchObject({ code: "23505", constraint: "categories_name_lower_key" });
    },
  );
});
