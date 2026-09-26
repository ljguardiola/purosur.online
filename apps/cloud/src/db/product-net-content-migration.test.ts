import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { products } from "./schema.js";
import { MIGRATIONS_FOLDER, migrateFreshDatabase } from "./test-database-snapshot.js";

const NET_CONTENT_MIGRATION_TAG_SUFFIX = "_product_net_content";

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

// Found by name rather than by number, so a renumbering after merging another branch's migration
// doesn't silently point this test at the wrong file.
async function netContentEntry(): Promise<JournalEntry> {
  const journal = await readRealJournal();
  const entry = journal.entries.find((candidate) =>
    candidate.tag.endsWith(NET_CONTENT_MIGRATION_TAG_SUFFIX),
  );
  if (!entry) {
    throw new Error("test setup: no product_net_content migration in the journal");
  }
  return entry;
}

/**
 * Builds a migrations folder holding only the real migrations that precede the net content one:
 * the schema as it stood right before this feature's own migration existed, so it can be applied
 * afterward, on its own, against data already seeded in that pre-migration shape.
 */
async function migrationsFolderBeforeNetContent(destFolder: string): Promise<void> {
  await mkdir(join(destFolder, "meta"), { recursive: true });
  const journal = await readRealJournal();
  const { idx } = await netContentEntry();
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

/** Adds this feature's real, already hand-edited product_net_content migration to the folder. */
async function addNetContentMigration(destFolder: string): Promise<void> {
  const journalPath = join(destFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
  const entry = await netContentEntry();
  journal.entries.push(entry);
  await writeFile(journalPath, JSON.stringify(journal));
  await copyFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(destFolder, `${entry.tag}.sql`));
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
