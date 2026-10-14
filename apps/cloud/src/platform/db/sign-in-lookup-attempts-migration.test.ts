import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the sign-in lookup attempts migration applied over a database that already holds registers", {
  timeout: 30_000,
}, () => {
  it("keeps every register and records lookups by register", async () => {
    const database = await databaseBeforeMigration("_sign_in_lookup_attempts");

    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const registerId = registerRows[0]?.id;

    const migrated = await database.applyMigration();

    const { rows: registers } = await migrated.query("select * from registers");
    expect(registers).toHaveLength(1);
    await migrated.query(
      "insert into sign_in_lookup_attempts (register_id, attempted_at) values ($1, now()), ($1, now())",
      [registerId],
    );
    const { rows: attempts } = await migrated.query("select * from sign_in_lookup_attempts");
    expect(attempts).toHaveLength(2);
    await expect(
      migrated.query(
        "insert into sign_in_lookup_attempts (register_id, attempted_at) values (gen_random_uuid(), now())",
      ),
    ).rejects.toThrow();
  });
});
