import { confirmRevokedInstallationUnsynced } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../installation/test-support/enrolled-installation.js";
import { DrizzleRegisterEventStreams } from "../sync/drizzle-register-event-streams.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleConfirmRevokedInstallationStore } from "./drizzle-confirm-revoked-installation-store.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import { WITHOUT_CREDIT_NOTES } from "./test-support/rejected-document-remedy-fixtures.js";

const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const KEY = { pointOfSaleNumber: 8, fortnight: FIRST_HALF };
const AT = new Date("2026-10-16T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let installationId: string;
let locationId: string;
let actorId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("confirm_revoked_installation_store");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  const db = drizzle(sql);
  const registerId = await seedOfflinePointOfSale(db);
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(FIRST_HALF, (acquisition) =>
    acquisition.keep({
      code: { code: "36123456789012", fortnight: FIRST_HALF, reportDeadline: "2026-10-20" },
      obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
  const installation = await insertEnrolledInstallation(db, {
    now: AT,
    existingRegisterId: registerId,
    enrolledAt: new Date("2026-10-05T12:00:00.000Z"),
    revokedAt: new Date("2026-10-10T12:00:00.000Z"),
  });
  installationId = installation.deviceId;
  locationId = await seededLocationId(db);
  const [actor] = await sql<{ id: string }[]>`select id from users limit 1`;
  if (!actor) {
    throw new Error("test setup: expected a user");
  }
  actorId = actor.id;
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

async function onOwnConnection<TOutcome>(
  use: (connection: PostgresJsDatabase) => Promise<TOutcome>,
): Promise<TOutcome> {
  const connection = postgres(integrationDb.databaseUrl, { max: 1 });
  try {
    return await use(drizzle(connection));
  } finally {
    await connection.end({ timeout: 1 });
  }
}

function confirm(db: PostgresJsDatabase) {
  return confirmRevokedInstallationUnsynced(
    {
      store: new DrizzleConfirmRevokedInstallationStore(
        db,
        (tx) => new DrizzleRegisterEventStreams(tx),
      ),
      clock: { now: () => AT },
      zoneRules: fixedZoneRulesSource(),
    },
    { locationId, pointOfSaleNumber: 8, fortnightStart: FIRST_HALF.start, installationId, actorId },
  );
}

describe("the confirm revoked installation store on a real Postgres", () => {
  it("waits for a run presenting the fortnight before holding the presentation", async () => {
    const events: string[] = [];
    const runMayFinish = gate();
    const runHolds = gate();

    const run = onOwnConnection((db) =>
      new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(KEY, async () => {
        events.push("run started");
        runHolds.open();
        await runMayFinish.opened;
        events.push("run finished");
      }),
    );
    await runHolds.opened;
    const confirmation = onOwnConnection((db) =>
      new DrizzleConfirmRevokedInstallationStore(
        db,
        (tx) => new DrizzleRegisterEventStreams(tx),
      ).transaction(async (tx) => {
        await tx.holdFortnightPresentation(KEY);
        events.push("confirmation held the presentation");
      }),
    );
    await waitForLockWaiters(sql, 1);
    runMayFinish.open();
    await Promise.all([run, confirmation]);

    expect(events).toEqual(["run started", "run finished", "confirmation held the presentation"]);
  });

  it("makes a run wait for a confirmation that holds the presentation, until it commits", async () => {
    const events: string[] = [];
    const confirmationMayFinish = gate();
    const confirmationHolds = gate();

    const confirmation = onOwnConnection((db) =>
      new DrizzleConfirmRevokedInstallationStore(
        db,
        (tx) => new DrizzleRegisterEventStreams(tx),
      ).transaction(async (tx) => {
        await tx.holdFortnightPresentation(KEY);
        confirmationHolds.open();
        await confirmationMayFinish.opened;
        events.push("confirmation finished");
      }),
    );
    await confirmationHolds.opened;
    const run = onOwnConnection((db) =>
      new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(KEY, async () => {
        events.push("run started");
      }),
    );
    await waitForLockWaiters(sql, 1);
    confirmationMayFinish.open();
    await Promise.all([confirmation, run]);

    expect(events).toEqual(["confirmation finished", "run started"]);
  });

  it("does not make a confirmation of another fortnight wait for a run", async () => {
    const runMayFinish = gate();
    const runHolds = gate();
    const run = onOwnConnection((db) =>
      new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(KEY, async () => {
        runHolds.open();
        await runMayFinish.opened;
      }),
    );
    await runHolds.opened;

    const held = await onOwnConnection((db) =>
      new DrizzleConfirmRevokedInstallationStore(
        db,
        (tx) => new DrizzleRegisterEventStreams(tx),
      ).transaction(async (tx) => {
        await tx.holdFortnightPresentation({ pointOfSaleNumber: 8, fortnight: SECOND_HALF });
        return "held";
      }),
    );
    runMayFinish.open();
    await run;

    expect(held).toBe("held");
  });

  it("confirms once when two people confirm the same installation at the same time, the other finding it already confirmed", async () => {
    const outcomes = await Promise.all([onOwnConnection(confirm), onOwnConnection(confirm)]);

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["already_confirmed", "confirmed"]);
    expect(await sql`select installation_id from revoked_installation_confirmations`).toHaveLength(
      1,
    );
    expect(await sql`select id from audit_log where entity = 'register_installation'`).toHaveLength(
      1,
    );
  });
});
