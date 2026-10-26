import {
  contingencyTicketRecoveriesResponseSchema,
  contingencyTicketRecoveryFinishResponseSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, contingencyTicketRecoveries } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerContingencyTicketRecoveriesRoutes } from "./contingency-ticket-recoveries-route.js";
import { rescueSession } from "./test-support/contingency-backup-ticket-rescue-route.js";
import { insertContingencyTicketRecovery } from "./test-support/contingency-ticket-recoveries.js";

const LIST_URL = "/contingency-backup-tickets/recoveries";
const OPENED_AT = new Date("2026-10-20T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  registerRouteAccess(app);
  registerContingencyTicketRecoveriesRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function anAwaitingRecovery(registerName = "Caja 1") {
  const predecessor = await insertEnrolledInstallation(db, {
    now: OPENED_AT,
    registerName,
    revokedAt: OPENED_AT,
  });
  const current = await insertEnrolledInstallation(db, {
    now: OPENED_AT,
    existingRegisterId: predecessor.registerId,
  });
  const recoveryId = await insertContingencyTicketRecovery(db, {
    registerId: predecessor.registerId,
    restoredDeviceId: current.deviceId,
    openedAt: OPENED_AT,
  });
  return { recoveryId, registerId: predecessor.registerId, restoredDeviceId: current.deviceId };
}

function listing(session?: BackofficeSession, origin = BACKOFFICE_ORIGIN) {
  return app.inject({
    method: "GET",
    url: LIST_URL,
    headers: { ...session?.headers, origin },
  });
}

function finishing(recoveryId: string, session?: BackofficeSession, origin = BACKOFFICE_ORIGIN) {
  return app.inject({
    method: "POST",
    url: `${LIST_URL}/${recoveryId}/finish`,
    headers: { ...session?.headers, origin },
  });
}

describe("GET /contingency-backup-tickets/recoveries", () => {
  it("answers 401 without a session", async () => {
    expect((await listing()).statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const session = await rescueSession(db);

    const response = await listing(session, "https://attacker.example");

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("answers 403 to a user without the permission to rescue tickets", async () => {
    await anAwaitingRecovery();
    const session = await rescueSession(db, ["view_backups_and_rotate_key"]);

    const response = await listing(session);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the recoveries that await with their register", async () => {
    const awaiting = await anAwaitingRecovery("Caja 3");
    const finished = await anAwaitingRecovery("Caja 4");
    const session = await rescueSession(db);
    await db
      .update(contingencyTicketRecoveries)
      .set({ finishedAt: OPENED_AT, finishedBy: session.userId })
      .where(eq(contingencyTicketRecoveries.id, finished.recoveryId));

    const response = await listing(session);

    expect(response.statusCode).toBe(200);
    expect(contingencyTicketRecoveriesResponseSchema.parse(response.json())).toEqual({
      recoveries: [
        {
          recovery_id: awaiting.recoveryId,
          register_id: awaiting.registerId,
          register_name: "Caja 3",
          opened_at: OPENED_AT.toISOString(),
        },
      ],
    });
  });

  it("lists nothing when no recovery awaits", async () => {
    const session = await rescueSession(db);

    const response = await listing(session);

    expect(response.json()).toEqual({ recoveries: [] });
  });
});

describe("POST /contingency-backup-tickets/recoveries/:id/finish", () => {
  it("answers 401 without a session", async () => {
    const { recoveryId } = await anAwaitingRecovery();

    expect((await finishing(recoveryId)).statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { recoveryId } = await anAwaitingRecovery();
    const session = await rescueSession(db);

    const response = await finishing(recoveryId, session, "https://attacker.example");

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("answers 403 to a user without the permission and leaves the recovery awaiting", async () => {
    const { recoveryId } = await anAwaitingRecovery();
    const session = await rescueSession(db, ["configure_branch"]);

    const response = await finishing(recoveryId, session);

    expect(response.statusCode).toBe(403);
    const [recovery] = await db.select().from(contingencyTicketRecoveries);
    expect(recovery?.finishedAt).toBeNull();
  });

  it("answers 400 to an id that is not a record id", async () => {
    const session = await rescueSession(db);

    const response = await finishing("not-an-id", session);

    expect(response.statusCode).toBe(400);
  });

  it("finishes the recovery, recording who and when, and audits it", async () => {
    const { recoveryId, registerId } = await anAwaitingRecovery();
    const session = await rescueSession(db);

    const response = await finishing(recoveryId, session);

    expect(response.statusCode).toBe(200);
    expect(contingencyTicketRecoveryFinishResponseSchema.parse(response.json())).toEqual({
      outcome: "finished",
    });
    expect(await db.select().from(contingencyTicketRecoveries)).toMatchObject([
      { id: recoveryId, finishedAt: SESSION_NOON, finishedBy: session.userId },
    ]);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entity, "contingency_ticket_recovery_finished")),
    ).toMatchObject([
      { entityId: recoveryId, actorId: session.userId, newValue: { register_id: registerId } },
    ]);
  });

  it("answers that a recovery already finished was, keeping the first finish", async () => {
    const { recoveryId } = await anAwaitingRecovery();
    const first = await rescueSession(db);
    await finishing(recoveryId, first);
    const second = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["recover_contingency_receipts", "configure_branch"],
      email: "second@example.com",
    });

    const response = await finishing(recoveryId, second);

    expect(response.json()).toEqual({ outcome: "already_finished" });
    expect(await db.select().from(contingencyTicketRecoveries)).toMatchObject([
      { finishedBy: first.userId },
    ]);
  });

  it("answers that a recovery that does not exist is not found", async () => {
    const session = await rescueSession(db);

    const response = await finishing(crypto.randomUUID(), session);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: "not_found" });
  });
});
