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

const REGISTERS_MIGRATION_TAG_SUFFIX = "_registers";

async function registersEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    REGISTERS_MIGRATION_TAG_SUFFIX,
    "test setup: no registers migration in the journal",
  );
}

async function migrationsFolderBeforeRegisters(destFolder: string): Promise<void> {
  await migrationsFolderBefore(destFolder, await registersEntry());
}

async function addRegistersMigration(destFolder: string): Promise<void> {
  await addMigrationEntry(destFolder, await registersEntry());
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

    await expect(
      client.query("insert into registers (location_id, name) values ($1, $2) returning id", [
        seededLocation.id,
        "Caja 1",
      ]),
    ).resolves.toMatchObject({ rows: [{ id: expect.any(String) }] });
  });
});
