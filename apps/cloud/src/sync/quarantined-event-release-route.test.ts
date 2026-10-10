import { randomUUID } from "node:crypto";
import { releaseQuarantinedEventErrorSchema } from "@purosur/contracts/sync/quarantined-events";
import { and, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openAlert } from "../alerts/open-alert.js";
import { alerts, auditLog, inbox } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerQuarantinedEventReleaseRoute } from "./quarantined-event-release-route.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import {
  insertInstallationOfAnotherBranch,
  insertQuarantinedEvent,
  QUARANTINED_AT,
} from "./test-support/quarantined-events.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let locationId: string;
let deviceId: string;

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
  ({ deviceId } = await insertEnrolledInstallation(db, { now: SESSION_NOON }));
  app = Fastify();
  registerQuarantinedEventReleaseRoute(app, {
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

function releaseRequest(eventId: string, headers: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: `/synced-events/${eventId}/release`, headers });
}

async function eventRow(eventId: string) {
  const [row] = await db.select().from(inbox).where(eq(inbox.eventId, eventId));
  return row;
}

async function openQuarantineAlertOf(eventId: string): Promise<string> {
  const outcome = await openAlert(
    db,
    {
      kind: "events_quarantined",
      scope: eventId,
      detail: {
        deviceId,
        eventId,
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId: "sale-1",
        reason: { kind: "not_recorded" },
      },
    },
    { now: () => SESSION_NOON },
  );
  const [alert] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.kind, "events_quarantined"), eq(alerts.scope, eventId)));
  if (!alert || outcome.kind !== "opened") {
    throw new Error("test setup: opening the quarantine alert did not open one");
  }
  return alert.id;
}

describe("POST /synced-events/:eventId/release", () => {
  it("answers 401 without a session", async () => {
    const response = await releaseRequest(randomUUID());

    expect(response.statusCode).toBe(401);
  });

  it("rejects a request from another origin, changing nothing", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const eventId = await insertQuarantinedEvent(db, deviceId);

    const response = await releaseRequest(eventId, {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect((await eventRow(eventId))?.quarantinedAt).toEqual(QUARANTINED_AT);
  });

  it("answers 403 to a session without the permission, for a quarantined event and for one that does not exist alike", async () => {
    const session = await sessionHolding(["view_all_alerts"]);
    const eventId = await insertQuarantinedEvent(db, deviceId);

    const quarantined = await releaseRequest(eventId, session.headers);
    const unknown = await releaseRequest(randomUUID(), session.headers);

    expect([quarantined.statusCode, unknown.statusCode]).toEqual([403, 403]);
    expect(await eventRow(eventId)).toMatchObject({ attempts: 8, quarantinedAt: QUARANTINED_AT });
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("answers 400 to an id that is not a record id", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);

    const response = await releaseRequest("not-an-id", session.headers);

    expect(response.statusCode).toBe(400);
  });

  it("answers 404 not_found to an event nobody received", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);

    const response = await releaseRequest(randomUUID(), session.headers);

    expect(response.statusCode).toBe(404);
    expect(releaseQuarantinedEventErrorSchema.parse(response.json()).code).toBe("not_found");
  });

  it("answers 404 not_found to an event of a register of another branch, changing nothing", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const elsewhere = await insertInstallationOfAnotherBranch(db, SESSION_NOON);
    const eventId = await insertQuarantinedEvent(db, elsewhere);

    const response = await releaseRequest(eventId, session.headers);

    expect(response.statusCode).toBe(404);
    expect(await eventRow(eventId)).toMatchObject({ attempts: 8, quarantinedAt: QUARANTINED_AT });
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it.each([
    ["applied", { appliedAt: QUARANTINED_AT, attempts: 8, quarantinedAt: QUARANTINED_AT }],
    ["waiting without a quarantine", { attempts: 3, nextAttemptAt: QUARANTINED_AT }],
  ])("answers 409 not_quarantined to an event %s, changing nothing", async (_name, values) => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const eventId = await insertInboxEvent(db, deviceId, values);
    const before = await eventRow(eventId);

    const response = await releaseRequest(eventId, session.headers);

    expect(response.statusCode).toBe(409);
    expect(releaseQuarantinedEventErrorSchema.parse(response.json()).code).toBe("not_quarantined");
    expect(await eventRow(eventId)).toEqual(before);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("answers 204 and gives the event a new series of attempts, keeping its payload and last error", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const eventId = await insertQuarantinedEvent(db, deviceId, { payload: { total: 100 } });
    const before = await eventRow(eventId);

    const response = await releaseRequest(eventId, session.headers);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await eventRow(eventId)).toEqual({
      ...before,
      attempts: 0,
      nextAttemptAt: null,
      quarantinedAt: null,
    });
  });

  it("records who released which event and when, with what it was before and after", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const eventId = await insertQuarantinedEvent(db, deviceId);

    await releaseRequest(eventId, session.headers);

    const rows = await db.select().from(auditLog);
    expect(rows).toEqual([
      {
        id: expect.any(String),
        entity: "synced_event",
        entityId: eventId,
        actorId: session.userId,
        at: SESSION_NOON,
        previousValue: {
          quarantinedAt: QUARANTINED_AT.toISOString(),
          attempts: 8,
          lastError: "product p-1 is not in the catalog",
        },
        newValue: { quarantinedAt: null, attempts: 0, nextAttemptAt: null },
      },
    ]);
  });

  it("resolves the quarantine alert of that event and no other", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const eventId = await insertQuarantinedEvent(db, deviceId);
    const otherEventId = await insertQuarantinedEvent(db, deviceId);
    const alertId = await openQuarantineAlertOf(eventId);
    const otherAlertId = await openQuarantineAlertOf(otherEventId);

    await releaseRequest(eventId, session.headers);

    const resolved = await db.select({ id: alerts.id, resolvedAt: alerts.resolvedAt }).from(alerts);
    expect(resolved.find((alert) => alert.id === alertId)?.resolvedAt).toEqual(SESSION_NOON);
    expect(resolved.find((alert) => alert.id === otherAlertId)?.resolvedAt).toBeNull();
  });

  it("releases an event that has no open alert", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const eventId = await insertQuarantinedEvent(db, deviceId);

    const response = await releaseRequest(eventId, session.headers);

    expect(response.statusCode).toBe(204);
  });

  it("refuses to release the same event twice", async () => {
    const session = await sessionHolding(["release_quarantined_events"]);
    const eventId = await insertQuarantinedEvent(db, deviceId);

    const first = await releaseRequest(eventId, session.headers);
    const second = await releaseRequest(eventId, session.headers);

    expect([first.statusCode, second.statusCode]).toEqual([204, 409]);
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });
});
