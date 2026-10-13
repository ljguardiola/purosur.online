import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the register installations migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every register and its code, leaving a code emitted before it unredeemable", async () => {
    const database = await databaseBeforeMigration("_register_installations");

    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const locationId = locationRows[0]?.id;
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationId],
    );
    const registerId = registerRows[0]?.id;
    await database.query(
      `insert into register_enrollment_codes (register_id, code_hash, issued_at, expires_at)
       values ($1, 'hash', now(), now() + interval '15 minutes')`,
      [registerId],
    );

    const migrated = await database.applyMigration();

    const { rows: codesAfter } = await migrated.query<{ register_id: string; code_lookup: string }>(
      "select register_id, code_lookup from register_enrollment_codes",
    );
    expect(codesAfter).toEqual([{ register_id: registerId, code_lookup: "" }]);

    await expect(
      migrated.query(
        `insert into register_installations
           (register_id, token_lookup_prefix, token_hash, hostname, windows_version, enrolled_at)
         values ($1, 'prefix', 'hash', 'CAJA', 'Windows 11', now()) returning id`,
        [registerId],
      ),
    ).resolves.toMatchObject({ rows: [{ id: expect.any(String) }] });
  });
});
