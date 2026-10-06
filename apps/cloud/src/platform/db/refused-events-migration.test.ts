import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

async function refusedEventsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_refused_events",
    "test setup: no refused events migration in the journal",
  );
}

describe("the refused events migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("records an installation revoked before it as replaced, and an active one with no reason", async () => {
    const folder = await mkdtemp(join(tmpdir(), "refused-events-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await refusedEventsEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());
    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const installation = async (prefix: string, revokedAt: string | null) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into register_installations
           (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname,
            windows_version, enrolled_at, revoked_at)
         values ($1, $2, 'hash', now(), 'CAJA', 'Windows 11', now(), $3) returning id`,
        [registerRows[0]?.id, prefix, revokedAt],
      );
      return rows[0]?.id;
    };
    const replaced = await installation("replaced", "2026-09-01T12:00:00.000Z");
    const active = await installation("active", null);

    await addMigrationEntry(folder, await refusedEventsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query<{ id: string; revocation_reason: string | null }>(
      "select id, revocation_reason from register_installations order by revoked_at nulls last",
    );
    expect(rows).toEqual([
      { id: replaced, revocation_reason: "replaced" },
      { id: active, revocation_reason: null },
    ]);
    const { rows: refused } = await client.query("select * from refused_events");
    expect(refused).toEqual([]);
  });
});
