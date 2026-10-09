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

const RECOVERY_LINK_SENT_MIGRATION_TAG_SUFFIX = "_recovery_link_sent";

describe("the recovery link sent migration applied over a database that already holds recovery tokens", {
  timeout: 30_000,
}, () => {
  it("marks a redeemed token as sent when it was issued and leaves an unredeemed one unsent", async () => {
    const entry = await findMigrationEntry(
      RECOVERY_LINK_SENT_MIGRATION_TAG_SUFFIX,
      "test setup: no recovery link sent migration in the journal",
    );
    const folder = await mkdtemp(join(tmpdir(), "recovery-link-sent-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, entry);

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: userRows } = await client.query<{ id: string }>(
      "insert into users (first_name, email, location_id) values ($1, $2, $3) returning id",
      ["Rocío Fictaria", `rocio-${randomUUID()}@example.com`, locationRows[0]?.id],
    );
    const userId = userRows[0]?.id;
    const redeemedIssuedAt = "2026-10-01T10:00:00.000Z";
    const unredeemedIssuedAt = "2026-10-01T11:00:00.000Z";
    await client.query(
      `insert into recovery_tokens (user_id, token_hash, issued_at, expires_at, used_at)
       values ($1, 'redeemed-hash', $2, $2::timestamptz + interval '15 minutes', $2::timestamptz + interval '5 minutes')`,
      [userId, redeemedIssuedAt],
    );
    await client.query(
      `insert into recovery_tokens (user_id, token_hash, issued_at, expires_at)
       values ($1, 'unredeemed-hash', $2, $2::timestamptz + interval '15 minutes')`,
      [userId, unredeemedIssuedAt],
    );

    await addMigrationEntry(folder, entry);
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query<{ token_hash: string; sent_at: Date | null }>(
      "select token_hash, sent_at from recovery_tokens order by issued_at",
    );
    expect(rows.map((row) => [row.token_hash, row.sent_at])).toEqual([
      ["redeemed-hash", new Date(redeemedIssuedAt)],
      ["unredeemed-hash", null],
    ]);
  });
});
