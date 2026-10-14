import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the installation keys migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an enrolled installation, with no outbox-chain key and no key for its register", async () => {
    const database = await databaseBeforeMigration("_installation_keys");

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
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname,
          windows_version, enrolled_at)
       values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now())`,
      [registerId],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ token_lookup_prefix: string; outbox_chain_key: null }>(
      "select token_lookup_prefix, outbox_chain_key from register_installations",
    );
    expect(rows).toEqual([{ token_lookup_prefix: "prefix", outbox_chain_key: null }]);
    const { rows: keyRows } = await migrated.query(
      `select register_id from register_snapshot_keys
       union all select register_id from register_contingency_ticket_keys`,
    );
    expect(keyRows).toEqual([]);
  });

  it.each(["register_snapshot_keys", "register_contingency_ticket_keys"])(
    "refuses a key in %s for a register that does not exist",
    async (table) => {
      const database = await databaseBeforeMigration("_installation_keys");
      const migrated = await database.applyMigration();

      await expect(
        migrated.query(
          `insert into ${table} (register_id, version, key)
         values ('00000000-0000-4000-8000-000000000000', 1, 'key')`,
        ),
      ).rejects.toThrow();
    },
  );
});
