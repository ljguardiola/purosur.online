import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function migratedDatabase() {
  const database = await databaseBeforeMigration("_fortnight_reports");
  await database.query(
    `insert into fiscal_addresses (name, street_address) values ('Deposito', 'Calle Ficticia 123')`,
  );
  const migrated = await database.applyMigration();
  await seedClaimAndCode(migrated);
  return migrated;
}

async function seedClaimAndCode(client: SqlOnlyDatabase) {
  await client.query(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
  );
  await client.query(
    `insert into users (first_name, email, location_id)
     select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
  );
  await client.query(
    `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
     select 7, registers.id, 'offline', users.id from registers, users`,
  );
  await client.query(
    `with kept as (
       insert into caea_codes
         (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
       values ('2026-10-01', '2026-10-15', '36123456789012', '2026-10-20',
               '2026-09-28T12:00:00Z', 'requested')
       returning id
     )
     insert into changes (entity, entity_id, version, op)
     select 'offline_authorization_code', id, 1, 'insert' from kept`,
  );
}

const insertReport = (
  state: string,
  { pointOfSale = 7, start = "2026-10-01", end = "2026-10-15" } = {},
) =>
  `insert into fortnight_reports
     (point_of_sale_number, fortnight_start, fortnight_end, state, recorded_at)
   values (${pointOfSale}, '${start}', '${end}', '${state}', '2026-10-16T12:00:00Z')`;

describe("the fortnight reports migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the existing data and accepts a report of each state", async () => {
    const client = await migratedDatabase();

    for (const state of ["blocked", "ready", "submitting", "refused", "accepted"]) {
      await client.query("delete from fortnight_reports");
      await client.query(insertReport(state));
    }

    const { rows: reports } = await client.query(
      "select state, last_attempt_at, rejections from fortnight_reports",
    );
    const { rows: addresses } = await client.query("select name from fiscal_addresses");
    expect(reports).toEqual([{ state: "accepted", last_attempt_at: null, rejections: null }]);
    expect(addresses).toEqual([{ name: "Deposito" }]);
  });

  it("refuses a state other than the ones a presentation goes through", async () => {
    const client = await migratedDatabase();

    await expect(client.query(insertReport("guessed"))).rejects.toThrow();
  });

  it("refuses a fortnight that does not end after it starts", async () => {
    const client = await migratedDatabase();

    await expect(client.query(insertReport("blocked", { end: "2026-10-01" }))).rejects.toThrow();
  });

  it("refuses a second report for the same point of sale and fortnight", async () => {
    const client = await migratedDatabase();
    await client.query(insertReport("blocked"));

    await expect(client.query(insertReport("accepted"))).rejects.toThrow();
  });

  it("refuses a report of a point of sale nobody claimed", async () => {
    const client = await migratedDatabase();

    await expect(client.query(insertReport("blocked", { pointOfSale: 8 }))).rejects.toThrow();
  });

  it("refuses a report of a fortnight with no kept code", async () => {
    const client = await migratedDatabase();

    await expect(
      client.query(insertReport("blocked", { start: "2026-09-16", end: "2026-09-30" })),
    ).rejects.toThrow();
  });

  it("keeps what an installation reported and leaves it not caught up", async () => {
    const database = await databaseBeforeMigration("_fortnight_reports");
    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const { rows: installationRows } = await database.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version,
          enrolled_at)
       values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
      [registerRows[0]?.id],
    );
    await database.query(
      `insert into device_state (device_id, app_version, reports_every_cycle_since)
       values ($1, '1.4.0', '2026-10-06T12:00:00Z')`,
      [installationRows[0]?.id],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<Record<string, unknown>>(
      "select app_version, reports_every_cycle_since, caught_up_at from device_state",
    );
    expect(rows).toEqual([
      {
        app_version: "1.4.0",
        reports_every_cycle_since: new Date("2026-10-06T12:00:00Z"),
        caught_up_at: null,
      },
    ]);
  });
});
