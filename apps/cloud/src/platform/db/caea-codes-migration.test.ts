import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

async function caeaCodesEntry(): Promise<JournalEntry> {
  return findMigrationEntry("_caea_codes", "test setup: no caea codes migration in the journal");
}

async function migratedDatabase() {
  const folder = await mkdtemp(join(tmpdir(), "caea-codes-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await caeaCodesEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  await client.query(
    `insert into fiscal_addresses (name, street_address) values ('Deposito', 'Calle Ficticia 123')`,
  );
  await addMigrationEntry(folder, await caeaCodesEntry());
  await migrate(drizzle(client), { migrationsFolder: folder });
  return client;
}

const insertCode = (obtainedThrough: string, fortnightEnd = "2026-10-15") =>
  `insert into caea_codes
     (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
   values ('2026-10-01', '', '21403471111111', '2026-10-30',
           '2026-09-28T12:00:00Z', '')`;

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
