import { pullChanges } from "@purosur/domain/sync/use-cases";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { DrizzleOfflineAuthorizationCodeHoldingReader } from "../../fiscal/drizzle-offline-authorization-code-holding-reader.js";
import { DrizzleOfflineAuthorizationCodeRequests } from "../../fiscal/drizzle-offline-authorization-code-requests.js";
import { configureOfflinePointOfSale } from "../../fiscal/test-support/offline-point-of-sale-fixtures.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { DrizzleChangeLog } from "../../sync/drizzle-change-log.js";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };

async function databaseWithOneCodeUnlogged() {
  const database = await databaseBeforeMigration("_offline_authorization_code_changes");

  const keepCode = async (fortnight: { start: string; end: string }) => {
    const { rows } = await database.query<{ id: string }>(
      `insert into caea_codes
         (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
       values ($1, $2, '21403471111111', '2026-11-15', '2026-09-28T12:00:00Z', 'requested')
       returning id`,
      [fortnight.start, fortnight.end],
    );
    return (rows[0] as { id: string }).id;
  };
  const loggedCodeId = await keepCode(FIRST_HALF);
  await database.query(
    `insert into changes (entity, entity_id, version, op)
     values ('offline_authorization_code', $1, 1, 'insert')`,
    [loggedCodeId],
  );
  const unloggedCodeId = await keepCode(SECOND_HALF);
  const { rows: before } = await database.query("select change_seq from changes");

  return { database, loggedCodeId, unloggedCodeId, changesBefore: before.length };
}

describe("the offline authorization code changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs only the code without an insert change, as an insert at version 1", async () => {
    const { database, unloggedCodeId, changesBefore } = await databaseWithOneCodeUnlogged();

    const migrated = await database.applyMigration();

    const { rows: logged } = await migrated.query(
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
    const { database, loggedCodeId, unloggedCodeId } = await databaseWithOneCodeUnlogged();
    const migrated = await database.applyMigration();
    const client = await migrated.applyEveryLaterMigration();
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
