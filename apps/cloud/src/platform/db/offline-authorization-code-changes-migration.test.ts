import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pullChanges } from "@purosur/domain/sync/use-cases";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { DrizzleOfflineAuthorizationCodeHoldingReader } from "../../fiscal/drizzle-offline-authorization-code-holding-reader.js";
import { DrizzleOfflineAuthorizationCodeRequests } from "../../fiscal/drizzle-offline-authorization-code-requests.js";
import { configureOfflinePointOfSale } from "../../fiscal/test-support/offline-point-of-sale-fixtures.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { DrizzleChangeLog } from "../../sync/drizzle-change-log.js";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import { MIGRATIONS_FOLDER } from "./migrations-folder.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };

async function offlineAuthorizationCodeChangesEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_offline_authorization_code_changes",
    "test setup: no offline authorization code changes migration in the journal",
  );
}

async function migratedDatabaseWithOneCodeUnlogged() {
  const folder = await mkdtemp(join(tmpdir(), "offline-authorization-code-changes-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await offlineAuthorizationCodeChangesEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());

  const keepCode = async (fortnight: { start: string; end: string }) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into caea_codes
         (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
       values ($1, $2, '21403471111111', '2026-11-15', '2026-09-28T12:00:00Z', 'requested')
       returning id`,
      [fortnight.start, fortnight.end],
    );
    return (rows[0] as { id: string }).id;
  };
  const loggedCodeId = await keepCode(FIRST_HALF);
  await client.query(
    `insert into changes (entity, entity_id, version, op)
     values ('offline_authorization_code', $1, 1, 'insert')`,
    [loggedCodeId],
  );
  const unloggedCodeId = await keepCode(SECOND_HALF);
  const { rows: before } = await client.query("select change_seq from changes");

  await addMigrationEntry(folder, await offlineAuthorizationCodeChangesEntry());
  await migrate(drizzle(client), { migrationsFolder: folder });
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

  return { client, loggedCodeId, unloggedCodeId, changesBefore: before.length };
}

describe("the offline authorization code changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs only the code without an insert change, as an insert at version 1", async () => {
    const { client, unloggedCodeId, changesBefore } = await migratedDatabaseWithOneCodeUnlogged();

    const { rows: logged } = await client.query(
      `select entity, entity_id, version, op, location_id, origin_device_id
       from changes order by change_seq offset $1`,
      [changesBefore],
    );

    expect(logged).toEqual([
      {
        entity: "offline_authorization_code",
        entity_id: unloggedCodeId,
        version: 1,
        op: "insert",
        location_id: null,
        origin_device_id: null,
      },
    ]);
  });

  it("delivers the backfilled code on the register's next pull and then counts the fortnight as held", async () => {
    const { client, loggedCodeId, unloggedCodeId } = await migratedDatabaseWithOneCodeUnlogged();
    const db = drizzle(client);
    const registerId = await configureOfflinePointOfSale(db, {
      registerName: "Caja 1",
      realTimePointOfSale: 2,
      offlinePointOfSale: 3,
      now: NOW,
    });
    const installation = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    const ports = {
      changeLog: new DrizzleChangeLog(db),
      offlineAuthorizationCodes: new DrizzleOfflineAuthorizationCodeRequests(db),
      clock: { now: () => NOW },
    };
    const holdings = () =>
      new DrizzleOfflineAuthorizationCodeHoldingReader(db).registerHoldings([
        FIRST_HALF,
        SECOND_HALF,
      ]);

    const page = await pullChanges(ports, { deviceId: installation.deviceId, since: 0 });
    await pullChanges(ports, { deviceId: installation.deviceId, since: page.cursor });

    expect(
      page.changes
        .filter(({ entity }) => entity === "offline_authorization_code")
        .map(({ entityId }) => entityId)
        .sort(),
    ).toEqual([loggedCodeId, unloggedCodeId].sort());
    await expect(holdings()).resolves.toEqual([
      {
        registerId,
        deviceId: installation.deviceId,
        heldFortnightStarts: [FIRST_HALF.start, SECOND_HALF.start],
      },
    ]);
  });
});
