import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the offline points of sale migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every register's real-time point of sale and its claim, marking both real-time", async () => {
    const database = await databaseBeforeMigration("_offline_points_of_sale");
    await database.query(
      `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
    );
    await database.query(
      `insert into users (first_name, email, location_id)
       select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
    );
    await database.query(
      `insert into fiscal_addresses (name, street_address) values ('Deposito', 'Calle Ficticia 123')`,
    );
    await database.query(
      `insert into point_of_sale_claims (point_of_sale_number, register_id, claimed_by)
       select 7, r.id, u.id from registers r, users u`,
    );
    await database.query(
      `insert into register_points_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
       select r.id, 7, f.id, 1 from registers r, fiscal_addresses f`,
    );

    const migrated = await database.applyMigration();

    const { rows: claims } = await migrated.query(
      "select point_of_sale_number, mechanism from point_of_sale_claims",
    );
    const { rows: setups } = await migrated.query(
      "select point_of_sale_number, mechanism, version from register_points_of_sale",
    );
    const { rows: offline } = await migrated.query(
      "select register_id from register_offline_points_of_sale",
    );
    expect(claims).toEqual([{ point_of_sale_number: 7, mechanism: "real_time" }]);
    expect(setups).toEqual([{ point_of_sale_number: 7, mechanism: "real_time", version: 1 }]);
    expect(offline).toEqual([]);
  });
});
