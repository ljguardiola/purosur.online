import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the register fiscal address assignments migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("assigns every configured register its current fiscal address since before any voucher, and none to a register never configured", async () => {
    const database = await databaseBeforeMigration("_register_fiscal_address_assignments");
    await database.query(
      `insert into registers (location_id, name)
       select location.id, names.name
         from (select id from locations limit 1) as location,
              (values ('Caja 1'), ('Caja 2'), ('Caja 3')) as names (name)`,
    );
    await database.query(
      `insert into users (first_name, email, location_id)
       select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
    );
    await database.query(
      `insert into fiscal_addresses (name, street_address)
       values ('Deposito Central', 'Calle Ficticia 123'), ('Local Norte', 'Calle Ficticia 456')`,
    );
    await database.query(
      `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
       select number, r.id, 'real_time', u.id
         from (values ('Caja 1', 7), ('Caja 2', 8)) as configured (name, number)
         join registers r on r.name = configured.name, users u`,
    );
    await database.query(
      `insert into register_points_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
       select r.id, configured.number, f.id, 1
         from (values ('Caja 1', 7, 'Deposito Central'), ('Caja 2', 8, 'Local Norte'))
              as configured (name, number, address)
         join registers r on r.name = configured.name
         join fiscal_addresses f on f.name = configured.address`,
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      `select r.name as register, f.name as address, a.assigned_at = '-infinity' as since_ever
         from register_fiscal_address_assignments a
         join registers r on r.id = a.register_id
         join fiscal_addresses f on f.id = a.fiscal_address_id
        order by r.name`,
    );
    expect(rows).toEqual([
      { register: "Caja 1", address: "Deposito Central", since_ever: true },
      { register: "Caja 2", address: "Local Norte", since_ever: true },
    ]);
  });
});
