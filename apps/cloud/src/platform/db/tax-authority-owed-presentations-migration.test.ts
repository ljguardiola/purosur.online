import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function migratedDatabase() {
  const database = await databaseBeforeMigration("_tax_authority_owed_presentations");
  await database.query(
    `insert into fiscal_addresses (name, street_address) values ('Deposito', 'Calle Ficticia 123')`,
  );
  return database.applyMigration();
}

const insertOwed = (pointOfSale = 9, fortnightStart = "2026-09-01") =>
  `insert into tax_authority_owed_presentations (point_of_sale_number, fortnight_start, listed_at)
   values (${pointOfSale}, '${fortnightStart}', '2026-10-16T12:00:00Z')`;

describe("the tax authority owed presentations migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the existing data and accepts a listed presentation of a point of sale nobody claimed", async () => {
    const client = await migratedDatabase();

    await client.query(insertOwed());
    await client.query(insertOwed(9, "2026-09-16"));
    await client.query(insertOwed(4));

    const { rows: owed } = await client.query(
      `select point_of_sale_number, fortnight_start::text as fortnight_start
       from tax_authority_owed_presentations order by 1, 2`,
    );
    const { rows: addresses } = await client.query("select name from fiscal_addresses");
    expect(owed).toEqual([
      { point_of_sale_number: 4, fortnight_start: "2026-09-01" },
      { point_of_sale_number: 9, fortnight_start: "2026-09-01" },
      { point_of_sale_number: 9, fortnight_start: "2026-09-16" },
    ]);
    expect(addresses).toEqual([{ name: "Deposito" }]);
  });

  it("refuses the same presentation of the same point of sale listed twice", async () => {
    const client = await migratedDatabase();
    await client.query(insertOwed());

    await expect(client.query(insertOwed())).rejects.toThrow();
  });
});
