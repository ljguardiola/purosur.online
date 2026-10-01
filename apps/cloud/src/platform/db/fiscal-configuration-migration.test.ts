import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
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

async function fiscalConfigurationEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_fiscal_configuration",
    "test setup: no fiscal configuration migration in the journal",
  );
}

async function databaseBeforeMigration() {
  const folder = await mkdtemp(join(tmpdir(), "fiscal-configuration-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await fiscalConfigurationEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  return { folder, client };
}

async function seedThresholdEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_seed_buyer_identification_threshold",
    "test setup: no buyer-identification threshold seed migration in the journal",
  );
}

describe("the fiscal configuration migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the issuer identification it finds as its first version, under no CUIT and not logged for the registers", async () => {
    const { folder, client } = await databaseBeforeMigration();
    await client.query(
      `update issuer_identification
       set legal_name = $1, gross_income_registration = $2,
           activity_start_date = '2020-01-15', version = 4`,
      [FICTIONAL_LEGAL_NAME, FICTIONAL_GROSS_INCOME_REGISTRATION],
    );
    const { rows: before } = await client.query("select entity from changes");

    await addMigrationEntry(folder, await fiscalConfigurationEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: versions } = await client.query(
      `select version, legal_name, gross_income_registration, activity_start_date::text as activity_start_date,
              authorized_cuit, recorded_by
       from issuer_identification_versions`,
    );
    expect(versions).toEqual([
      {
        version: 4,
        legal_name: FICTIONAL_LEGAL_NAME,
        gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activity_start_date: "2020-01-15",
        authorized_cuit: null,
        recorded_by: null,
      },
    ]);
    const { rows: after } = await client.query("select entity from changes");
    expect(after).toHaveLength(before.length);
  });

  it("keeps an identification that was never filled in as a first version with nothing in it", async () => {
    const { folder, client } = await databaseBeforeMigration();

    await addMigrationEntry(folder, await fiscalConfigurationEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query(
      "select version, legal_name, gross_income_registration, activity_start_date from issuer_identification_versions",
    );
    expect(rows).toEqual([
      { version: 1, legal_name: null, gross_income_registration: null, activity_start_date: null },
    ]);
  });

  it("seeds no threshold and no buyer tax-status set", async () => {
    const { folder, client } = await databaseBeforeMigration();

    await addMigrationEntry(folder, await fiscalConfigurationEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: thresholds } = await client.query(
      "select id from buyer_identification_thresholds",
    );
    const { rows: sets } = await client.query("select id from buyer_tax_status_sets");
    expect([thresholds, sets]).toEqual([[], []]);
  });
});

describe("the buyer-identification threshold seed migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  async function databaseBeforeSeed() {
    const folder = await mkdtemp(join(tmpdir(), "threshold-seed-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await seedThresholdEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());
    return { folder, client };
  }

  it("leaves a threshold of 10,000,000 pesos in effect since long before any sale, set by no one", async () => {
    const { folder, client } = await databaseBeforeSeed();

    await addMigrationEntry(folder, await seedThresholdEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query(
      "select amount::text as amount, valid_from::text as valid_from, recorded_by from buyer_identification_thresholds",
    );
    expect(rows).toEqual([{ amount: "1000000000", valid_from: "2000-01-01", recorded_by: null }]);
  });

  it("logs the seeded threshold once, so a register pulling from the first cursor receives it", async () => {
    const { folder, client } = await databaseBeforeSeed();

    await addMigrationEntry(folder, await seedThresholdEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: logged } = await client.query(
      `select c.version, c.op
       from changes c
       join buyer_identification_thresholds t on t.id = c.entity_id
       where c.entity = 'buyer_identification_threshold'`,
    );
    expect(logged).toEqual([{ version: 1, op: "insert" }]);
  });
});
