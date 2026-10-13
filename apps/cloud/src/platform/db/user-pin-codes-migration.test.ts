import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the user PIN codes migration applied over a database that already holds users", {
  timeout: 30_000,
}, () => {
  it("keeps every user and lets a PIN code be emitted for one that already existed", async () => {
    const database = await databaseBeforeMigration("_user_pin_codes");

    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: userRows } = await database.query<{ id: string }>(
      "insert into users (first_name, email, location_id) values ($1, $2, $3) returning id",
      ["Ada Lucero", `ada-${randomUUID()}@example.com`, locationRows[0]?.id],
    );
    const userId = userRows[0]?.id;

    const migrated = await database.applyMigration();

    const { rows: usersAfter } = await migrated.query<{ id: string }>(
      "select id from users where id = $1",
      [userId],
    );
    expect(usersAfter).toHaveLength(1);
    const { rows: pins } = await migrated.query("select * from user_pins");
    expect(pins).toHaveLength(0);
    await expect(
      migrated.query(
        `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
         values ($1, 'hash', $1, now(), now() + interval '15 minutes') returning failed_attempts`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ failed_attempts: 0 }] });
  });
});
