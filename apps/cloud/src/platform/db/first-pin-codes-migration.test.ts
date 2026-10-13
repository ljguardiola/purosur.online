import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the first PIN codes migration applied over a database that already holds PIN codes", {
  timeout: 30_000,
}, () => {
  it("keeps every issued code and lets a code be recorded with no issuer", async () => {
    const database = await databaseBeforeMigration("_first_pin_codes");

    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: userRows } = await database.query<{ id: string }>(
      "insert into users (first_name, email, location_id) values ($1, $2, $3) returning id",
      ["Ada Lucero", `ada-${randomUUID()}@example.com`, locationRows[0]?.id],
    );
    const userId = userRows[0]?.id;
    await database.query(
      `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
       values ($1, 'issued-hash', $1, now(), now() + interval '15 minutes')`,
      [userId],
    );
    await expect(
      database.query(
        `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
         values ($1, 'anonymous-hash', null, now(), now() + interval '15 minutes')`,
        [userId],
      ),
    ).rejects.toThrow();

    const migrated = await database.applyMigration();

    const { rows: kept } = await migrated.query<{ code_hash: string; issued_by: string }>(
      "select code_hash, issued_by from user_pin_codes",
    );
    expect(kept).toEqual([{ code_hash: "issued-hash", issued_by: userId }]);
    await expect(
      migrated.query(
        `insert into user_pin_codes (user_id, code_hash, issued_by, issued_at, expires_at)
         values ($1, 'anonymous-hash', null, now(), now() + interval '15 minutes')
         returning issued_by`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ issued_by: null }] });
  });
});
