import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function migratedDatabase() {
  const database = await databaseBeforeMigration("_caea_codes");
  await database.query(
    `insert into fiscal_addresses (name, street_address) values ('Deposito', 'Calle Ficticia 123')`,
  );
  return database.applyMigration();
}

const insertCode = (obtainedThrough: string, fortnightEnd = "2026-10-15") =>
  `insert into caea_codes
     (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
   values ('2026-10-01', '${fortnightEnd}', '21403471111111', '2026-10-30',
           '2026-09-28T12:00:00Z', '${obtainedThrough}')`;

describe("the caea codes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the existing data and accepts a code of each way of obtaining it", async () => {
    const client = await migratedDatabase();

    await client.query(insertCode("requested"));
    await client.query(
      `insert into caea_codes
         (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
       values ('2026-10-16', '2026-10-31', '21403471111112', '2026-11-15',
               '2026-09-28T12:00:00Z', 'recovered')`,
    );

    const { rows: codes } = await client.query(
      "select fortnight_start::text as fortnight_start, obtained_through from caea_codes order by 1",
    );
    const { rows: addresses } = await client.query("select name from fiscal_addresses");
    expect(codes).toEqual([
      { fortnight_start: "2026-10-01", obtained_through: "requested" },
      { fortnight_start: "2026-10-16", obtained_through: "recovered" },
    ]);
    expect(addresses).toEqual([{ name: "Deposito" }]);
  });

  it("refuses a fortnight that does not end after it starts", async () => {
    const client = await migratedDatabase();

    await expect(client.query(insertCode("requested", "2026-10-01"))).rejects.toThrow();
  });

  it("refuses a second code for the same fortnight", async () => {
    const client = await migratedDatabase();
    await client.query(insertCode("requested"));

    await expect(client.query(insertCode("recovered"))).rejects.toThrow();
  });

  it("refuses a way of obtaining a code other than requested or recovered", async () => {
    const client = await migratedDatabase();

    await expect(client.query(insertCode("guessed"))).rejects.toThrow();
  });
});
