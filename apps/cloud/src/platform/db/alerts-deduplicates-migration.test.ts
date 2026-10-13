import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

describe("the migration that lets an alert kind skip deduplication, over a database that already holds alerts", {
  timeout: 30_000,
}, () => {
  it("keeps every alert already open deduplicating, while alerts that skip it open side by side", async () => {
    const database = await databaseBeforeMigration("_alerts_deduplicates");

    const insertOpenAlert = (
      sql: SqlOnlyDatabase,
      kind: string,
      extraColumns = "",
      extraValues = "",
    ) =>
      sql.query(
        `insert into alerts (kind, scope, level, audience, detail${extraColumns})
           values ($1, 'a-user-id', 'warning', 'all', '{}'${extraValues})`,
        [kind],
      );
    await insertOpenAlert(database, "user_email_changed");

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ deduplicates: boolean }>(
      "select deduplicates from alerts where kind = 'user_email_changed'",
    );
    expect(rows).toEqual([{ deduplicates: true }]);
    await expect(insertOpenAlert(migrated, "user_email_changed")).rejects.toThrow(
      /alerts_open_dedup_key/,
    );

    await insertOpenAlert(migrated, "user_access_increased", ", deduplicates", ", false");
    await insertOpenAlert(migrated, "user_access_increased", ", deduplicates", ", false");
    const { rows: increases } = await migrated.query(
      "select id from alerts where kind = 'user_access_increased' and resolved_at is null",
    );
    expect(increases).toHaveLength(2);
  });
});
