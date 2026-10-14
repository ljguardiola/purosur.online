import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the PIN code redemption attempts migration applied over a database that already holds PIN codes", {
  timeout: 30_000,
}, () => {
  it("keeps every PIN code and records attempts by register and by source address", async () => {
    const database = await databaseBeforeMigration("_pin_code_redemption_attempts");
    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: userRows } = await database.query<{ id: string }>(
      "insert into users (first_name, email, location_id) values ('Ada Lucero', 'ada@example.com', $1) returning id",
      [locationRows[0]?.id],
    );
    const userId = userRows[0]?.id;
    await database.query(
      `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
       values ($1, 'hash', $1, now(), now() + interval '15 minutes')`,
      [userId],
    );

    const migrated = await database.applyMigration();

    const { rows: pinCodes } = await migrated.query("select * from user_pin_codes");
    expect(pinCodes).toHaveLength(1);
    await migrated.query(
      `insert into pin_code_redemption_attempts (key_kind, key_value, attempted_at)
       values ('register', 'a-register', now()), ('source_address', '203.0.113.7', now())`,
    );
    const { rows: attempts } = await migrated.query<{ key_kind: string }>(
      "select key_kind from pin_code_redemption_attempts order by key_kind::text",
    );
    expect(attempts.map((row) => row.key_kind)).toEqual(["register", "source_address"]);
    await expect(
      migrated.query(
        "insert into pin_code_redemption_attempts (key_kind, key_value, attempted_at) values ('user', 'x', now())",
      ),
    ).rejects.toThrow();
  });
});
