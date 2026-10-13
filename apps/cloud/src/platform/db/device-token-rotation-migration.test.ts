import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the device token rotation migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an enrolled installation, with a token issue time and no pending token", async () => {
    const database = await databaseBeforeMigration("_device_token_rotation");

    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const registerId = registerRows[0]?.id;
    await database.query(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, hostname, windows_version, enrolled_at)
       values ($1, 'prefix', 'hash', 'CAJA', 'Windows 11', now())`,
      [registerId],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{
      token_lookup_prefix: string;
      token_issued_at: Date | null;
      pending_token_lookup_prefix: string | null;
      pending_token_hash: string | null;
      pending_token_issued_at: Date | null;
    }>(
      `select token_lookup_prefix, token_issued_at, pending_token_lookup_prefix,
              pending_token_hash, pending_token_issued_at
       from register_installations`,
    );
    expect(rows).toEqual([
      {
        token_lookup_prefix: "prefix",
        token_issued_at: expect.any(Date),
        pending_token_lookup_prefix: null,
        pending_token_hash: null,
        pending_token_issued_at: null,
      },
    ]);
  });

  it("refuses two installations holding the same pending token", async () => {
    const database = await databaseBeforeMigration("_device_token_rotation");
    const migrated = await database.applyMigration();

    const { rows: locationRows } = await migrated.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const insertInstallation = async (prefix: string) => {
      const { rows } = await migrated.query<{ id: string }>(
        "insert into registers (location_id, name) values ($1, $2) returning id",
        [locationRows[0]?.id, `Caja ${prefix}`],
      );
      return migrated.query(
        `insert into register_installations
           (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname,
            windows_version, enrolled_at, pending_token_lookup_prefix, pending_token_hash,
            pending_token_issued_at)
         values ($1, $2, 'hash', now(), 'CAJA', 'Windows 11', now(), 'shared', 'hash', now())`,
        [rows[0]?.id, prefix],
      );
    };

    await insertInstallation("first");

    await expect(insertInstallation("second")).rejects.toThrow();
  });
});
