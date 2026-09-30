import { randomUUID } from "node:crypto";
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
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

const FIRST_PIN_CODES_MIGRATION_TAG_SUFFIX = "_first_pin_codes";

describe("the first PIN codes migration applied over a database that already holds PIN codes", {
  timeout: 30_000,
}, () => {
  it("keeps every issued code and lets a code be recorded with no issuer", async () => {
    const entry = await findMigrationEntry(
      FIRST_PIN_CODES_MIGRATION_TAG_SUFFIX,
      "test setup: no first PIN codes migration in the journal",
    );
    const folder = await mkdtemp(join(tmpdir(), "first-pin-codes-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, entry);

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: userRows } = await client.query<{ id: string }>(
      "insert into users (first_name, email, location_id) values ($1, $2, $3) returning id",
      ["Ada Lovelace", `ada-${randomUUID()}@example.com`, locationRows[0]?.id],
    );
    const userId = userRows[0]?.id;
    await client.query(
      `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
       values ($1, 'issued-hash', $1, now(), now() + interval '15 minutes')`,
      [userId],
    );
    await expect(
      client.query(
        `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
         values ($1, 'anonymous-hash', null, now(), now() + interval '15 minutes')`,
        [userId],
      ),
    ).rejects.toThrow();

    await addMigrationEntry(folder, entry);
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: kept } = await client.query<{ code_hash: string; issued_by: string }>(
      "select code_hash, issued_by from user_pin_codes",
    );
    expect(kept).toEqual([{ code_hash: "issued-hash", issued_by: userId }]);
    await expect(
      client.query(
        `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
         values ($1, 'anonymous-hash', null, now(), now() + interval '15 minutes')
         returning issued_by`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ issued_by: null }] });
  });
});
