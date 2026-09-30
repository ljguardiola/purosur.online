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

const USER_PIN_CODES_MIGRATION_TAG_SUFFIX = "_user_pin_codes";

describe("the user PIN codes migration applied over a database that already holds users", {
  timeout: 30_000,
}, () => {
  it("keeps every user and lets a PIN code be emitted for one that already existed", async () => {
    const entry = await findMigrationEntry(
      USER_PIN_CODES_MIGRATION_TAG_SUFFIX,
      "test setup: no user PIN codes migration in the journal",
    );
    const folder = await mkdtemp(join(tmpdir(), "user-pin-codes-migration-"));
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

    await addMigrationEntry(folder, entry);
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: usersAfter } = await client.query<{ id: string }>(
      "select id from users where id = $1",
      [userId],
    );
    expect(usersAfter).toHaveLength(1);
    const { rows: pins } = await client.query("select * from user_pins");
    expect(pins).toHaveLength(0);
    await expect(
      client.query(
        `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
         values ($1, 'hash', $1, now(), now() + interval '15 minutes') returning failed_attempts`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ failed_attempts: 0 }] });
  });
});
