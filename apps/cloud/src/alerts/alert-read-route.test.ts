import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  alertDeliveries,
  alerts,
  locations,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { hashSourceAddress } from "../session/sign-in-lockout.js";
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
      scope: "a-user-id",
      level: "warning",
      audience: input.audience,
      locationId: input.audience === "local" ? (input.locationId ?? ownLocationId) : null,
      detail: { previousEmail: "old@example.com" },
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

  it("answers the identical 404 for a malformed id, a missing one, and one the viewer cannot see", async () => {
    const roleId = await insertRole("local", ["view_branch_alerts"]);
    const userId = await insertUserWithRole("Cajera", roleId);
    const rawSessionId = await insertSession(userId);
    const invisibleAlertId = await insertAlert({ audience: "local", locationId: otherLocationId });

    const malformedResponse = await getAlert(rawSessionId, "not-a-uuid");
    const missingResponse = await getAlert(rawSessionId, "00000000-0000-0000-0000-000000000000");
    const invisibleResponse = await getAlert(rawSessionId, invisibleAlertId);

    expect(malformedResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(invisibleResponse.statusCode).toBe(404);
    expect(malformedResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(invisibleResponse.json());
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
        recipient: { id: string; first_name: string; role: { name: string | null } };
      }[];
    };
    expect(body).toMatchObject({
      id: alertId,
      kind: "user_email_changed",
      detail: { previousEmail: "old@example.com" },
    });
    expect(body.deliveries).toEqual([
      {
        channel: "backoffice",
        status: "sent",
        error: null,
        created_at: expect.any(String),
        recipient: {
          id: viewerId,
          first_name: "Grace",
          role: {
            id: viewerRoleId,
            name: expect.stringContaining("supervisor"),
            is_administrator: false,
          },
        },
      },
    ]);
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
        detail: { sourceAddress: hashedAddress, failureCount: 6 },
        openedAt: NOON,
        resolvedAt: NOON,
      })
      .returning({ id: alerts.id });
    if (!alertRow) throw new Error("test setup: inserting the alert returned no row");

    const response = await getAlert(rawSessionId, alertRow.id);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(hashedAddress);
    expect(response.json()).toMatchObject({ scope: null, detail: { failureCount: 6 } });
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
      scope_display: string;
      detail: { actorId: string; actorName?: string };
    };
    expect(body.scope_display).toBe("Lucía");
    expect(body.detail.actorName).toBe("Ada");
  });
});
