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

const ALERTS_DEDUPLICATES_MIGRATION_TAG_SUFFIX = "_alerts_deduplicates";

describe("the migration that lets an alert kind skip deduplication, over a database that already holds alerts", {
  timeout: 30_000,
}, () => {
  it("keeps every alert already open deduplicating, while alerts that skip it open side by side", async () => {
    const entry = await findMigrationEntry(
      ALERTS_DEDUPLICATES_MIGRATION_TAG_SUFFIX,
      "test setup: no alerts deduplicates migration in the journal",
    );
    const folder = await mkdtemp(join(tmpdir(), "alerts-deduplicates-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, entry);

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const insertOpenAlert = (kind: string, extraColumns = "", extraValues = "") =>
      client.query(
        `insert into alerts (kind, scope, level, audience, detail${extraColumns})
           values ($1, 'a-user-id', 'warning', 'all', '{}'${extraValues})`,
        [kind],
      );
    await insertOpenAlert("user_email_changed");

    await addMigrationEntry(folder, entry);
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query<{ deduplicates: boolean }>(
      "select deduplicates from alerts where kind = 'user_email_changed'",
    );
    expect(rows).toEqual([{ deduplicates: true }]);
    await expect(insertOpenAlert("user_email_changed")).rejects.toThrow(/alerts_open_dedup_key/);

    await insertOpenAlert("user_access_increased", ", deduplicates", ", false");
    await insertOpenAlert("user_access_increased", ", deduplicates", ", false");
    const { rows: increases } = await client.query(
      "select id from alerts where kind = 'user_access_increased' and resolved_at is null",
    );
    expect(increases).toHaveLength(2);
  });
});
