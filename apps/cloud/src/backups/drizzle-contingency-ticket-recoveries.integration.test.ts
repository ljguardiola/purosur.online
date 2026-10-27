import {
  askContingencyTicketRecovery,
  finishContingencyTicketRecovery,
} from "@purosur/domain/backups/use-cases";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contingencyTicketRecoveries } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { openBackofficeSession } from "../test-support/backoffice-session.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleContingencyTicketRecoveries } from "./drizzle-contingency-ticket-recoveries.js";
import { insertContingencyTicketRecovery } from "./test-support/contingency-ticket-recoveries.js";

const NOW = new Date("2026-10-20T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let recoveries: DrizzleContingencyTicketRecoveries<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("contingency_ticket_recoveries");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  recoveries = new DrizzleContingencyTicketRecoveries(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("DrizzleContingencyTicketRecoveries against Postgres", () => {
  it("opens a single recovery when the same installation asks at the same time", async () => {
    const predecessor = await insertEnrolledInstallation(db, { now: NOW, revokedAt: NOW });
    const current = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: predecessor.registerId,
    });
    const ports = { recoveries, clock: { now: () => NOW } };
    const asking = { registerId: predecessor.registerId, restoredDeviceId: current.deviceId };

    const answers = await Promise.all([
      askContingencyTicketRecovery(ports, asking),
      askContingencyTicketRecovery(ports, asking),
    ]);

    expect(answers).toEqual([{ kind: "awaiting" }, { kind: "awaiting" }]);
    expect(await db.select().from(contingencyTicketRecoveries)).toHaveLength(1);
  });

  it("lets only one of two concurrent finishes finish the recovery", async () => {
    const predecessor = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 2",
      revokedAt: NOW,
    });
    const current = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: predecessor.registerId,
    });
    const { userId } = await openBackofficeSession(db, {
      now: NOW,
      locationId: await seededLocationId(db),
      permissionKeys: [],
    });
    const recoveryId = await insertContingencyTicketRecovery(db, {
      registerId: predecessor.registerId,
      restoredDeviceId: current.deviceId,
      openedAt: NOW,
    });
    const ports = { recoveries, clock: { now: () => NOW } };
    const finishing = () =>
      finishContingencyTicketRecovery(ports, { recoveryId, finishedBy: userId });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select id from contingency_ticket_recoveries where id = ${recoveryId} for update`,
      finishing,
      finishing,
    );

    expect(outcomes).toEqual([{ kind: "finished" }, { kind: "already_finished" }]);
  });
});
