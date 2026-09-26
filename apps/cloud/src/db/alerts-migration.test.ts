import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { MIGRATIONS_FOLDER, migrateFreshDatabase } from "./test-database-snapshot.js";

const ALERTS_MIGRATION_TAG_SUFFIX = "_alerts";

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
async function alertsEntry(): Promise<JournalEntry> {
  const journal = await readRealJournal();
  const entry = journal.entries.find((candidate) =>
    candidate.tag.endsWith(ALERTS_MIGRATION_TAG_SUFFIX),
  );
  if (!entry) {
    throw new Error("test setup: no alerts migration in the journal");
  }
  return entry;
}

/**
 * Builds a migrations folder holding only the real migrations that precede the alerts one: the
 * schema as it stood right before this feature's own migration existed, so it can be applied
 * afterward, on its own, against data seeded in that pre-migration shape.
 */
async function migrationsFolderBeforeAlerts(destFolder: string): Promise<void> {
  await mkdir(join(destFolder, "meta"), { recursive: true });
  const journal = await readRealJournal();
  const { idx } = await alertsEntry();
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

/** Adds this feature's real, already hand-edited alerts migration to the folder. */
async function addAlertsMigration(destFolder: string): Promise<void> {
  const journalPath = join(destFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
  const entry = await alertsEntry();
  journal.entries.push(entry);
  await writeFile(journalPath, JSON.stringify(journal));
  await copyFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(destFolder, `${entry.tag}.sql`));
}

interface QueryClient {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
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

describe("the alerts migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps prior rows intact and lets an alert and its delivery be recorded for data that already existed", async () => {
    const folder = await mkdtemp(join(tmpdir(), "alerts-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBeforeAlerts(folder);

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
    const actorId = await insertUser(client, seededLocation.id, `ada-${randomUUID()}@example.com`);
    await client.query(
      "insert into audit_log (entity, entity_id, actor_id, new_value) values ($1, $2, $3, $4)",
      ["user", actorId, actorId, JSON.stringify({ email: `ada-${randomUUID()}@example.com` })],
    );

    await addAlertsMigration(folder);
    await migrate(drizzle(client), { migrationsFolder: folder });

    // The rows seeded before the migration are untouched.
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

    // An alert can be opened scoped to a user that already existed before the migration, and
    // resolved by one too.
    const { rows: alertRows } = await client.query<{ id: string }>(
      `insert into alerts (kind, scope, level, audience, detail, resolved_by)
         values ($1, $2, $3, $4, $5, $6) returning id`,
      ["user_email_changed", actorId, "warning", "all", JSON.stringify({}), actorId],
    );
    const alert = alertRows[0];
    expect(alert?.id).toEqual(expect.any(String));

    // A delivery of that alert can be recorded for a recipient that already existed too.
    await expect(
      client.query(
        "insert into alert_deliveries (alert_id, recipient_user_id) values ($1, $2) returning id",
        [alert?.id, actorId],
      ),
    ).resolves.toMatchObject({ rows: [{ id: expect.any(String) }] });
  });
});
