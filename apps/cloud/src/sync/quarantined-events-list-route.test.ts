import { quarantinedEventsListSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openAlert } from "../alerts/open-alert.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerQuarantinedEventsListRoute } from "./quarantined-events-list-route.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import {
  closeQuarantineAlertOf,
  insertInstallationOfAnotherBranch,
  insertQuarantinedEvent,
  openQuarantineAlertOf,
  QUARANTINED_AT,
} from "./test-support/quarantined-events.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let locationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  locationId = await seededLocationId(db);
  app = Fastify();
  registerQuarantinedEventsListRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function sessionHolding(permissionKeys: string[]): Promise<BackofficeSession> {
  return openBackofficeSession(db, { now: SESSION_NOON, locationId, permissionKeys });
}

function listRequest(headers: Record<string, string> = {}) {
  return app.inject({ method: "GET", url: "/synced-events/quarantined", headers });
}

describe("GET /synced-events/quarantined", () => {
  it("answers 401 without a session", async () => {
    const response = await listRequest();

    expect(response.statusCode).toBe(401);
  });

  it("answers 403 to a session without the permission to release quarantined events", async () => {
    const session = await sessionHolding(["view_all_alerts"]);
    const { deviceId } = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    await insertQuarantinedEvent(db, deviceId);

    const response = await listRequest(session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain("not in the catalog");
  });

  it("rejects a request from another origin", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);

    const response = await listRequest({ ...session.headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("lists the quarantined events of the branch with their register and why they were quarantined, oldest quarantine first", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: SESSION_NOON,
      registerName: "Caja 2",
    });
    const later = await insertQuarantinedEvent(db, deviceId, {
      quarantinedAt: new Date("2026-10-07T14:00:00.000Z"),
    });
    const earlier = await insertQuarantinedEvent(db, deviceId, {
      aggregateType: "CashSession",
      aggregateId: "0199b7a0-0000-7000-8000-000000000009",
      eventType: "cash_session_opened",
      receivedAt: new Date("2026-10-07T09:00:00.000Z"),
    });
    await openQuarantineAlertOf(db, earlier, {
      reason: { kind: "unreadable" },
      openedAt: QUARANTINED_AT,
    });

    const response = await listRequest(session.headers);

    expect(response.statusCode).toBe(200);
    expect(quarantinedEventsListSchema.parse(response.json())).toEqual({
      events: [
        {
          eventId: earlier,
          registerName: "Caja 2",
          aggregateType: "CashSession",
          aggregateId: "0199b7a0-0000-7000-8000-000000000009",
          eventType: "cash_session_opened",
          receivedAt: "2026-10-07T09:00:00.000Z",
          quarantinedAt: QUARANTINED_AT.toISOString(),
          reason: { kind: "unreadable" },
        },
        expect.objectContaining({ eventId: later, reason: null }),
      ],
    });
  });

  it("tells why an event was quarantined from its latest quarantine alert, even one already closed", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const { deviceId } = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const eventId = await insertQuarantinedEvent(db, deviceId);
    await openQuarantineAlertOf(db, eventId, {
      reason: { kind: "unreadable" },
      openedAt: new Date("2026-10-06T12:00:00.000Z"),
    });
    await closeQuarantineAlertOf(db, eventId, new Date("2026-10-06T13:00:00.000Z"));
    await openQuarantineAlertOf(db, eventId, {
      reason: { kind: "missing_dependency", aggregateType: "CashSession", aggregateId: "s-1" },
      openedAt: QUARANTINED_AT,
    });
    await closeQuarantineAlertOf(db, eventId, new Date("2026-10-07T12:30:00.000Z"));
    await openAlert(
      db,
      {
        kind: "event_invariant_violated",
        scope: eventId,
        detail: {
          eventId,
          eventType: "sale_completed",
          aggregateType: "Sale",
          aggregateId: "sale-1",
          breaks: ["approved_payments_below_total"],
        },
      },
      { now: () => new Date("2026-10-07T13:00:00.000Z") },
    );

    const response = await listRequest(session.headers);

    expect(response.json().events).toEqual([
      expect.objectContaining({
        eventId,
        reason: { kind: "missing_dependency", aggregateType: "CashSession", aggregateId: "s-1" },
      }),
    ]);
  });

  it("leaves out applied events, events waiting without a quarantine and events of another branch", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const { deviceId } = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const otherBranchDevice = await insertInstallationOfAnotherBranch(db, SESSION_NOON);
    const listed = await insertQuarantinedEvent(db, deviceId);
    await insertQuarantinedEvent(db, deviceId, { appliedAt: QUARANTINED_AT });
    await insertInboxEvent(db, deviceId, { attempts: 2 });
    await insertQuarantinedEvent(db, otherBranchDevice);

    const response = await listRequest(session.headers);

    expect(response.json().events.map((event: { eventId: string }) => event.eventId)).toEqual([
      listed,
    ]);
  });

  it("answers no events when nothing is in quarantine", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);

    const response = await listRequest(session.headers);

    expect(response.json()).toEqual({ events: [] });
  });
});
