import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the points of sale migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every existing register, with no point of sale and no fiscal address, and logs nothing for them", async () => {
    const database = await databaseBeforeMigration("_fiscal_addresses_and_points_of_sale");
    await database.query(
      `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
    );
    const { rows: before } = await database.query("select entity from changes");

    const migrated = await database.applyMigration();

    const { rows: registers } = await migrated.query("select name from registers");
    const { rows: setups } = await migrated.query(
      "select register_id from register_points_of_sale",
    );
    const { rows: claims } = await migrated.query("select register_id from point_of_sale_claims");
    const { rows: addresses } = await migrated.query("select id from fiscal_addresses");
    const { rows: after } = await migrated.query("select entity from changes");
    expect(registers).toEqual([{ name: "Caja 1" }]);
    expect([setups, claims, addresses]).toEqual([[], [], []]);
    expect(after).toHaveLength(before.length);
  });
});
