import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { MIGRATIONS_FOLDER, migrateFreshDatabase } from "./test-database-snapshot.js";

const REGISTERS_MIGRATION_TAG_SUFFIX = "_registers";

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
async function registersEntry(): Promise<JournalEntry> {
  const journal = await readRealJournal();
  const entry = journal.entries.find((candidate) =>
    candidate.tag.endsWith(REGISTERS_MIGRATION_TAG_SUFFIX),
  );
  if (!entry) {
    throw new Error("test setup: no registers migration in the journal");
  }
  return entry;
}

/**
 * Builds a migrations folder holding only the real migrations that precede the registers one: the
 * schema as it stood right before this feature's own migration existed, so it can be applied
 * afterward, on its own, against data seeded in that pre-migration shape. Only `_journal.json` and
 * the migration `.sql` files themselves matter to the runtime migrator (unlike `drizzle-kit
 * generate`, it never reads the per-migration snapshot files).
 */
async function migrationsFolderBeforeRegisters(destFolder: string): Promise<void> {
  await mkdir(join(destFolder, "meta"), { recursive: true });
  const journal = await readRealJournal();
  const { idx } = await registersEntry();
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

/** Adds this feature's real, already hand-edited registers migration to the folder. */
async function addRegistersMigration(destFolder: string): Promise<void> {
  const journalPath = join(destFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
  const entry = await registersEntry();
  journal.entries.push(entry);
  await writeFile(journalPath, JSON.stringify(journal));
  await copyFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(destFolder, `${entry.tag}.sql`));
}

interface QueryClient {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}

async function insertLocation(client: QueryClient): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "insert into locations default values returning id",
  );
  const location = rows[0];
  if (!location) {
    throw new Error("test setup: seeding a location returned no row");
  }
  return location.id;
}

async function insertUser(client: QueryClient, locationId: string, email: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "insert into users (first_name, email, location_id) values ($1, $2, $3) returning id",
    ["Ada Lovelace", email, locationId],
  );
  const user = rows[0];
  if (!user) {
    throw new Error("test setup: seeding a user returned no row");
  }
  return user.id;
}

describe("the registers migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps prior rows intact and lets a register be created for a location that already existed", async () => {
    const folder = await mkdtemp(join(tmpdir(), "registers-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBeforeRegisters(folder);

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    // Seeded by migration 0011: the one location every earlier migration already assumes exists.
    const { rows: seededLocationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const seededLocation = seededLocationRows[0];
    if (!seededLocation) {
      throw new Error("test setup: no location seeded by the migrations run so far");
    }
    const otherLocationId = await insertLocation(client);
    const actorId = await insertUser(client, seededLocation.id, `ada-${randomUUID()}@example.com`);
    await client.query(
      "insert into audit_log (entity, entity_id, actor_id, new_value) values ($1, $2, $3, $4)",
      ["user", actorId, actorId, JSON.stringify({ email: `ada-${randomUUID()}@example.com` })],
    );

    await addRegistersMigration(folder);
    await migrate(drizzle(client), { migrationsFolder: folder });

    // The rows seeded before the migration are untouched.
    const { rows: locationsAfter } = await client.query<{ id: string }>("select id from locations");
    expect(locationsAfter.map((row) => row.id).sort()).toEqual(
      [seededLocation.id, otherLocationId].sort(),
    );
    const { rows: usersAfter } = await client.query<{ id: string }>(
      "select id from users where id = $1",
      [actorId],
    );
    expect(usersAfter).toHaveLength(1);
    const { rows: auditAfter } = await client.query<{ entity_id: string }>(
      "select entity_id from audit_log where entity_id = $1",
      [actorId],
    );
    expect(auditAfter).toHaveLength(1);

    // A register can be inserted for a location that already existed before the migration.
    await expect(
      client.query("insert into registers (location_id, name) values ($1, $2) returning id", [
        seededLocation.id,
        "Caja 1",
      ]),
    ).resolves.toMatchObject({ rows: [{ id: expect.any(String) }] });
  });
});
