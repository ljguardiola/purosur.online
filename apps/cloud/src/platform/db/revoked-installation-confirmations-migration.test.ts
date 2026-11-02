import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function migratedDatabase() {
  const database = await databaseBeforeMigration("_revoked_installation_confirmations");
  await database.query(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
  );
  await database.query(
    `insert into users (first_name, email, location_id)
     select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
  );
  await database.query(
    `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
     select 7, registers.id, 'offline', users.id from registers, users`,
  );
  await database.query(
    `insert into register_installations
       (id, register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at, revoked_at, revocation_reason)
     select '0199b7a0-0000-7000-8000-000000000001', id, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now(), now(), 'replaced'
     from registers`,
  );
  return database.applyMigration();
}

const insertConfirmation = (pointOfSale: number, installationId: string) =>
  `insert into revoked_installation_confirmations
     (point_of_sale_number, fortnight_start, installation_id, confirmed_by, confirmed_at)
   select ${pointOfSale}, '2026-10-01', '${installationId}', users.id, '2026-10-16T12:00:00Z'
   from users`;

describe("the revoked installation confirmations migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("records who confirmed that a revoked installation issued nothing unsynced in a fortnight", async () => {
    const client = await migratedDatabase();

    await client.query(insertConfirmation(7, "0199b7a0-0000-7000-8000-000000000001"));

    const { rows } = await client.query(
      `select point_of_sale_number, fortnight_start::text, installation_id, confirmed_at
       from revoked_installation_confirmations`,
    );
    expect(rows).toEqual([
      {
        point_of_sale_number: 7,
        fortnight_start: "2026-10-01",
        installation_id: "0199b7a0-0000-7000-8000-000000000001",
        confirmed_at: new Date("2026-10-16T12:00:00.000Z"),
      },
    ]);
  });

  it("refuses to confirm the same installation twice for the same fortnight of a point of sale", async () => {
    const client = await migratedDatabase();
    await client.query(insertConfirmation(7, "0199b7a0-0000-7000-8000-000000000001"));

    await expect(
      client.query(insertConfirmation(7, "0199b7a0-0000-7000-8000-000000000001")),
    ).rejects.toThrow(/revoked_installation_confirmations_pkey/);
  });

  it("refuses a confirmation of an installation that does not exist", async () => {
    const client = await migratedDatabase();

    await expect(
      client.query(insertConfirmation(7, "0199b7a0-0000-7000-8000-0000000000ff")),
    ).rejects.toThrow(/foreign key/);
  });
});
