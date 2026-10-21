import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alertDeliveries,
  alerts,
  locations,
  registers,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { hashSourceAddress } from "../sessions/sign-in-lockout.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerAlertReadRoute } from "./alert-read-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let ownLocationId: string;
let otherLocationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  ownLocationId = await seededLocationId(db);
  const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!otherLocation) throw new Error("test setup: inserting the other location returned no row");
  otherLocationId = otherLocation.id;

  app = Fastify();
  registerAlertReadRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

async function insertRole(name: string, permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: `${name}-${Math.random()}`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) throw new Error("test setup: inserting the role returned no row");
  for (const permissionKey of permissionKeys) {
    await db.insert(rolePermissions).values({ roleId: role.id, permissionKey });
  }
  return role.id;
}

async function insertUserWithRole(
  firstName: string,
  roleId: string,
  locationId: string = ownLocationId,
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName,
      email: `${firstName.toLowerCase()}-${Math.random()}@example.com`,
      locationId,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("test setup: inserting the user returned no row");
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

async function insertAlert(input: {
  audience: "local" | "all";
  locationId?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(alerts)
    .values({
      kind: "user_email_changed",
      scope: "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6",
      level: "warning",
      audience: input.audience,
      locationId: input.audience === "local" ? (input.locationId ?? ownLocationId) : null,
      detail: {
        previousEmail: "old@example.com",
        newEmail: "new@example.com",
        actorId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      },
      openedAt: NOON,
    })
    .returning({ id: alerts.id });
  if (!row) throw new Error("test setup: inserting the alert returned no row");
  return row.id;
}

function getAlert(rawSessionId: string | undefined, id: string) {
  return app.inject({
    method: "GET",
    url: `/alerts/${id}`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
  });
}

describe("GET /alerts/:id", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getAlert(undefined, "00000000-0000-0000-0000-000000000000");

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 forbidden for a user with neither alert-view permission", async () => {
    const roleId = await insertRole("sin-permiso", []);
    const userId = await insertUserWithRole("Nadie", roleId);
    const rawSessionId = await insertSession(userId);
    const alertId = await insertAlert({ audience: "all" });

    const response = await getAlert(rawSessionId, alertId);

    expect(response.statusCode).toBe(403);
  });

  it("answers the identical 404 for a missing id and one the viewer cannot see", async () => {
    const roleId = await insertRole("local", ["view_branch_alerts"]);
    const userId = await insertUserWithRole("Cajera", roleId);
    const rawSessionId = await insertSession(userId);
    const invisibleAlertId = await insertAlert({ audience: "local", locationId: otherLocationId });

    const missingResponse = await getAlert(rawSessionId, "00000000-0000-0000-0000-000000000000");
    const invisibleResponse = await getAlert(rawSessionId, invisibleAlertId);

    expect(missingResponse.statusCode).toBe(404);
    expect(invisibleResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toEqual(invisibleResponse.json());
  });

  it("answers 400 validation_failed naming id for a malformed id", async () => {
    const roleId = await insertRole("local", ["view_branch_alerts"]);
    const userId = await insertUserWithRole("Cajera", roleId);
    const rawSessionId = await insertSession(userId);

    const response = await getAlert(rawSessionId, "not-a-uuid");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
  });

  it("shows a visible alert's detail with its delivery per recipient's name and role", async () => {
    const viewerRoleId = await insertRole("supervisor", ["view_all_alerts"]);
    const viewerId = await insertUserWithRole("Grace", viewerRoleId);
    const rawSessionId = await insertSession(viewerId);
    const alertId = await insertAlert({ audience: "all" });
    await db.insert(alertDeliveries).values({
      alertId,
      recipientUserId: viewerId,
      channel: "backoffice",
      status: "sent",
    });

    const response = await getAlert(rawSessionId, alertId);

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      id: string;
      kind: string;
      detail: unknown;
      deliveries: {
        channel: string;
        status: string;
        recipient: { id: string; firstName: string; role: { name: string | null } };
      }[];
    };
    expect(body).toMatchObject({
      id: alertId,
      kind: "user_email_changed",
      detail: { previousEmail: "old@example.com" },
      open: true,
    });
    expect(body.deliveries).toEqual([
      {
        channel: "backoffice",
        status: "sent",
        error: null,
        createdAt: expect.any(String),
        recipient: {
          id: viewerId,
          firstName: "Grace",
          role: {
            id: viewerRoleId,
            name: expect.stringContaining("supervisor"),
            isAdministrator: false,
          },
        },
      },
    ]);
  });

  it("answers how the alert's kind closes", async () => {
    const viewerRoleId = await insertRole("supervisor", ["view_all_alerts"]);
    const viewerId = await insertUserWithRole("Grace", viewerRoleId);
    const rawSessionId = await insertSession(viewerId);
    const closedByHandId = await insertAlert({ audience: "all" });
    const [quiet] = await db
      .insert(alerts)
      .values({
        kind: "register_silent",
        scope: "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6",
        level: "critical",
        audience: "local",
        locationId: ownLocationId,
        detail: { deviceId: "device-1", lastAcceptedPushAt: "2026-01-05T11:30:00.000Z" },
        openedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!quiet) throw new Error("test setup: inserting the alert returned no row");

    const closedByHand = await getAlert(rawSessionId, closedByHandId);
    const closesByItself = await getAlert(rawSessionId, quiet.id);

    expect(closedByHand.json()).toMatchObject({ closing: "by_hand" });
    expect(closesByItself.json()).toMatchObject({ closing: "by_itself" });
  });

  it("shows an alert of lots nearing expiry to someone who holds the local alerts of its branch, scoped to the branch", async () => {
    const roleId = await insertRole("local", ["view_branch_alerts"]);
    const userId = await insertUserWithRole("Cajera", roleId);
    const rawSessionId = await insertSession(userId);
    const [expiring] = await db
      .insert(alerts)
      .values({
        kind: "lots_expiring",
        scope: ownLocationId,
        level: "informational",
        audience: "local",
        locationId: ownLocationId,
        detail: { lotCount: 6, windowDays: 30 },
        openedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!expiring) throw new Error("test setup: inserting the alert returned no row");

    const response = await getAlert(rawSessionId, expiring.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: "lots_expiring",
      level: "informational",
      scopeKind: "branch",
      detail: { lotCount: 6, windowDays: 30, aboutViewerBranch: true },
      closing: "by_itself",
      open: true,
    });
  });

  it("tells someone who sees every branch's alerts that an alert of lots nearing expiry is about another branch", async () => {
    const roleId = await insertRole("supervisor", ["view_all_alerts"]);
    const userId = await insertUserWithRole("Grace", roleId);
    const rawSessionId = await insertSession(userId);
    const [expiring] = await db
      .insert(alerts)
      .values({
        kind: "lots_expiring",
        scope: otherLocationId,
        level: "informational",
        audience: "local",
        locationId: otherLocationId,
        detail: { lotCount: 2, windowDays: 30 },
        openedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!expiring) throw new Error("test setup: inserting the alert returned no row");

    const response = await getAlert(rawSessionId, expiring.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: "lots_expiring",
      detail: { lotCount: 2, windowDays: 30, aboutViewerBranch: false },
    });
  });

  it("lists the deliveries by when they were written, ties in a stable order", async () => {
    const viewerRoleId = await insertRole("supervisor", ["view_all_alerts"]);
    const viewerId = await insertUserWithRole("Grace", viewerRoleId);
    const rawSessionId = await insertSession(viewerId);
    const alertId = await insertAlert({ audience: "all" });
    const writtenLast = await insertUserWithRole("Tercera", viewerRoleId);
    const tiedWithHigherId = await insertUserWithRole("Segunda", viewerRoleId);
    const tiedWithLowerId = await insertUserWithRole("Primera", viewerRoleId);
    const oneMinuteLater = new Date(NOON.getTime() + 60_000);
    await db.insert(alertDeliveries).values([
      { alertId, recipientUserId: writtenLast, createdAt: oneMinuteLater },
      {
        id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
        alertId,
        recipientUserId: tiedWithHigherId,
        createdAt: NOON,
      },
      {
        id: "00000000-0000-4000-8000-000000000000",
        alertId,
        recipientUserId: tiedWithLowerId,
        createdAt: NOON,
      },
    ]);

    const response = await getAlert(rawSessionId, alertId);

    expect(response.statusCode).toBe(200);
    const recipientNames = (
      response.json() as { deliveries: { recipient: { firstName: string } }[] }
    ).deliveries.map((delivery) => delivery.recipient.firstName);
    expect(recipientNames).toEqual(["Primera", "Segunda", "Tercera"]);
  });

  it("never sends a closed lockout alert's stored address hash", async () => {
    const viewerRoleId = await insertRole("supervisor", ["view_all_alerts"]);
    const viewerId = await insertUserWithRole("Grace", viewerRoleId);
    const rawSessionId = await insertSession(viewerId);
    const hashedAddress = hashSourceAddress("203.0.113.5");
    const [alertRow] = await db
      .insert(alerts)
      .values({
        kind: "backoffice_sign_in_lockout",
        scope: hashedAddress,
        level: "warning",
        audience: "all",
        detail: {
          sourceAddress: hashedAddress,
          failureCount: 6,
          blockedUntil: "2026-05-04T12:15:00.000Z",
        },
        openedAt: NOON,
        resolvedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!alertRow) throw new Error("test setup: inserting the alert returned no row");

    const response = await getAlert(rawSessionId, alertRow.id);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(hashedAddress);
    expect(response.json()).toMatchObject({
      scope: null,
      detail: { failureCount: 6 },
      open: false,
    });
    expect(response.json()).not.toHaveProperty("detail.sourceAddress");
  });

  it("resolves a user-scoped alert's scope and its detail's actorId to first names", async () => {
    const viewerRoleId = await insertRole("supervisor", ["view_all_alerts"]);
    const viewerId = await insertUserWithRole("Grace", viewerRoleId);
    const rawSessionId = await insertSession(viewerId);
    const administratorRoleId = await insertRole("administrator", []);
    const administratorId = await insertUserWithRole("Ada", administratorRoleId);
    const targetRoleId = await insertRole("target", []);
    const targetId = await insertUserWithRole("Lucía", targetRoleId);
    const [alertRow] = await db
      .insert(alerts)
      .values({
        kind: "user_email_changed",
        scope: targetId,
        level: "warning",
        audience: "all",
        detail: {
          previousEmail: "old@example.com",
          newEmail: "new@example.com",
          actorId: administratorId,
        },
        openedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!alertRow) throw new Error("test setup: inserting the alert returned no row");

    const response = await getAlert(rawSessionId, alertRow.id);

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      scopeDisplay: string;
      detail: { actorId: string; actorName?: string };
    };
    expect(body.scopeDisplay).toBe("Lucía");
    expect(body.detail.actorName).toBe("Ada");
  });
});

describe("GET /alerts/:id for a register that lacks a fortnight's offline authorization code", () => {
  async function insertMissingCodeAlert(fortnight: { start: string; end: string }) {
    const [register] = await db
      .insert(registers)
      .values({ locationId: ownLocationId, name: "Caja 1" })
      .returning({ id: registers.id });
    if (!register) throw new Error("test setup: inserting the register returned no row");
    const [alert] = await db
      .insert(alerts)
      .values({
        kind: "offline_authorization_code_missing",
        scope: `${register.id}:${fortnight.start}`,
        level: "critical",
        audience: "all",
        detail: {
          deviceId: "device-1",
          fortnightStart: fortnight.start,
          fortnightEnd: fortnight.end,
        },
        openedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!alert) throw new Error("test setup: inserting the alert returned no row");
    return alert.id;
  }

  async function viewerSession(): Promise<string> {
    const viewerRoleId = await insertRole("supervisor", ["view_all_alerts"]);
    return insertSession(await insertUserWithRole("Grace", viewerRoleId));
  }

  it("names the register, with the kind of scope, and says the fortnight has not started when the cloud's day is before its first day", async () => {
    const rawSessionId = await viewerSession();
    const alertId = await insertMissingCodeAlert({ start: "2026-01-16", end: "2026-01-31" });

    const response = await getAlert(rawSessionId, alertId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      scopeDisplay: "Caja 1",
      scopeKind: "registerFortnight",
      detail: {
        deviceId: "device-1",
        fortnightStart: "2026-01-16",
        fortnightEnd: "2026-01-31",
        fortnightStarted: false,
      },
    });
  });

  it("says the fortnight has started when the cloud's day is within it", async () => {
    const rawSessionId = await viewerSession();
    const alertId = await insertMissingCodeAlert({ start: "2026-01-01", end: "2026-01-15" });

    const response = await getAlert(rawSessionId, alertId);

    expect(response.json()).toMatchObject({ detail: { fortnightStarted: true } });
  });

  it("answers nothing about a fortnight for any other kind of alert", async () => {
    const rawSessionId = await viewerSession();
    const alertId = await insertAlert({ audience: "all" });

    const response = await getAlert(rawSessionId, alertId);

    expect(response.json().detail).not.toHaveProperty("fortnightStarted");
  });
});

describe("GET /alerts/:id for the refund of a late payment", () => {
  it("answers the warning of the branch with the refund as its scope and the sale, amount and payment method to give back", async () => {
    const viewerRoleId = await insertRole("supervisor", ["view_all_alerts"]);
    const rawSessionId = await insertSession(await insertUserWithRole("Grace", viewerRoleId));
    const refundId = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
    const [alert] = await db
      .insert(alerts)
      .values({
        kind: "late_payment_refund",
        scope: refundId,
        level: "warning",
        audience: "local",
        locationId: ownLocationId,
        detail: {
          saleId: "9d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10",
          amount: 250000,
          providerOrderId: null,
          method: "POINT",
        },
        openedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!alert) throw new Error("test setup: inserting the alert returned no row");

    const response = await getAlert(rawSessionId, alert.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: "late_payment_refund",
      scope: refundId,
      scopeKind: "refund",
      level: "warning",
      audience: "local",
      open: true,
      closing: "with_its_refund",
      detail: {
        saleId: "9d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10",
        amount: 250000,
        providerOrderId: null,
        method: "POINT",
      },
    });
  });
});

describe("GET /alerts/:id for a point of sale's fortnight report", () => {
  const presentation = {
    pointOfSaleNumber: 4,
    fortnightStart: "2026-09-01",
    fortnightEnd: "2026-09-15",
    deadline: "2026-09-23",
  };

  async function insertRegister(name: string): Promise<string> {
    const [register] = await db
      .insert(registers)
      .values({ locationId: ownLocationId, name })
      .returning({ id: registers.id });
    if (!register) throw new Error("test setup: inserting the register returned no row");
    return register.id;
  }

  function withoutDeadline<T extends { deadline: string }>({ deadline: _omitted, ...rest }: T) {
    return rest;
  }

  async function insertFortnightReportAlert(
    kind:
      | "fortnight_report_pending"
      | "fortnight_report_overdue"
      | "fortnight_report_needs_regularization",
    registerId: string,
  ) {
    const [alert] = await db
      .insert(alerts)
      .values({
        kind,
        scope: "4:2026-09-01",
        level: kind === "fortnight_report_pending" ? "warning" : "critical",
        audience: "all",
        detail:
          kind === "fortnight_report_pending"
            ? { ...presentation, registerId, daysLeft: 3, reason: "blocked" }
            : kind === "fortnight_report_overdue"
              ? { ...presentation, registerId }
              : withoutDeadline({ ...presentation, registerId }),
        openedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!alert) throw new Error("test setup: inserting the alert returned no row");
    return alert.id;
  }

  async function viewerSession(): Promise<string> {
    const viewerRoleId = await insertRole("supervisor", ["view_all_alerts"]);
    return insertSession(await insertUserWithRole("Grace", viewerRoleId));
  }

  it("names the register of the point of sale in the detail and shows the fortnight in the scope, which a notice closes by itself", async () => {
    const registerId = await insertRegister("Caja 1");
    const alertId = await insertFortnightReportAlert("fortnight_report_pending", registerId);

    const response = await getAlert(await viewerSession(), alertId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: "fortnight_report_pending",
      scopeDisplay: "4:2026-09-01:2026-09-15",
      scopeKind: "pointOfSaleFortnight",
      closing: "by_itself",
      detail: {
        ...presentation,
        registerId,
        registerName: "Caja 1",
        daysLeft: 3,
        reason: "blocked",
      },
    });
  });

  it("names the register of an overdue alert, which only a person closes", async () => {
    const registerId = await insertRegister("Caja 2");
    const alertId = await insertFortnightReportAlert("fortnight_report_overdue", registerId);

    const response = await getAlert(await viewerSession(), alertId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: "fortnight_report_overdue",
      closing: "by_hand",
      detail: { ...presentation, registerId, registerName: "Caja 2" },
    });
  });

  it("names the register of an alert that needs regularization, which only a person closes", async () => {
    const registerId = await insertRegister("Caja 3");
    const alertId = await insertFortnightReportAlert(
      "fortnight_report_needs_regularization",
      registerId,
    );

    const response = await getAlert(await viewerSession(), alertId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: "fortnight_report_needs_regularization",
      scopeDisplay: "4:2026-09-01:2026-09-15",
      closing: "by_hand",
      detail: { ...withoutDeadline({ ...presentation, registerId }), registerName: "Caja 3" },
    });
    expect(response.json().detail).not.toHaveProperty("deadline");
  });

  it("names no register when the detail's register no longer exists", async () => {
    const alertId = await insertFortnightReportAlert(
      "fortnight_report_overdue",
      "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6",
    );

    const response = await getAlert(await viewerSession(), alertId);

    expect(response.statusCode).toBe(200);
    expect(response.json().detail).not.toHaveProperty("registerName");
  });
});
