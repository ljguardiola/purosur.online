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

const MIGRATION_TAG_SUFFIX = "_pin_code_redemption_attempts";

describe("the PIN code redemption attempts migration applied over a database that already holds PIN codes", {
  timeout: 30_000,
}, () => {
  it("keeps every PIN code and records attempts by register and by source address", async () => {
    const entry = await findMigrationEntry(
      MIGRATION_TAG_SUFFIX,
      "test setup: no PIN code redemption attempts migration in the journal",
    );
    const folder = await mkdtemp(join(tmpdir(), "pin-code-redemption-attempts-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, entry);

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: userRows } = await client.query<{ id: string }>(
      "insert into users (first_name, email, location_id) values ('Ada Lovelace', 'ada@example.com', $1) returning id",
      [locationRows[0]?.id],
    );
    const userId = userRows[0]?.id;
    await client.query(
      `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
       values ($1, 'hash', $1, now(), now() + interval '15 minutes')`,
      [userId],
    );

    await addMigrationEntry(folder, entry);
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: pinCodes } = await client.query("select * from user_pin_codes");
    expect(pinCodes).toHaveLength(1);
    await client.query(
      `insert into pin_code_redemption_attempts (key_kind, key_value, attempted_at)
       values ('register', 'a-register', now()), ('source_address', '203.0.113.7', now())`,
    );
    const { rows: attempts } = await client.query<{ key_kind: string }>(
      "select key_kind from pin_code_redemption_attempts order by key_kind::text",
    );
    expect(attempts.map((row) => row.key_kind)).toEqual(["register", "source_address"]);
    await expect(
      client.query(
        "insert into pin_code_redemption_attempts (key_kind, key_value, attempted_at) values ('user', 'x', now())",
      ),
    ).rejects.toThrow();
  });
});
