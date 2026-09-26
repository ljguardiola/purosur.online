import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./migration-journal-test-helpers.js";
import { migrateFreshDatabase } from "./test-database-snapshot.js";

const ALERTS_MIGRATION_TAG_SUFFIX = "_alerts";

async function alertsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    ALERTS_MIGRATION_TAG_SUFFIX,
    "test setup: no alerts migration in the journal",
  );
}

async function migrationsFolderBeforeAlerts(destFolder: string): Promise<void> {
  await migrationsFolderBefore(destFolder, await alertsEntry());
}

/** Adds this feature's real, already hand-edited alerts migration to the folder. */
async function addAlertsMigration(destFolder: string): Promise<void> {
  await addMigrationEntry(destFolder, await alertsEntry());
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
