import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the refused events migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("records an installation revoked before it as replaced, and an active one with no reason", async () => {
    const database = await databaseBeforeMigration("_refused_events");
    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const installation = async (prefix: string, revokedAt: string | null) => {
      const { rows } = await database.query<{ id: string }>(
        `insert into register_installations
           (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname,
            windows_version, enrolled_at, revoked_at)
         values ($1, $2, 'hash', now(), 'CAJA', 'Windows 11', now(), $3) returning id`,
        [registerRows[0]?.id, prefix, revokedAt],
      );
      return rows[0]?.id;
    };
    const replaced = await installation("replaced", "2026-09-01T12:00:00.000Z");
    const active = await installation("active", null);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ id: string; revocation_reason: string | null }>(
      "select id, revocation_reason from register_installations order by revoked_at nulls last",
    );
    expect(rows).toEqual([
      { id: replaced, revocation_reason: "replaced" },
      { id: active, revocation_reason: null },
    ]);
    const { rows: refused } = await migrated.query("select * from refused_events");
    expect(refused).toEqual([]);
  });
});
