import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
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
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerAlertsListRoute } from "./alerts-list-route.js";

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
  registerAlertsListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

async function insertRole(permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({
      name: `role-${permissionKeys.join("-") || "none"}-${Math.random()}`,
      isAdministrator: false,
    })
    .returning({ id: roles.id });
  if (!role) throw new Error("test setup: inserting the role returned no row");
  for (const permissionKey of permissionKeys) {
    await db.insert(rolePermissions).values({ roleId: role.id, permissionKey });
  }
  return role.id;
}

async function insertUserWithRole(
  roleId: string,
  locationId: string = ownLocationId,
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada", email: `ada-${Math.random()}@example.com`, locationId })
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
  kind: string;
  scope: string;
  level?: "informational" | "warning" | "critical";
  audience: "local" | "all";
  locationId?: string | null;
  resolvedAt?: Date | null;
}): Promise<string> {
  const [row] = await db
    .insert(alerts)
    .values({
      kind: input.kind,
      scope: input.scope,
      level: input.level ?? "warning",
      audience: input.audience,
      locationId: input.audience === "local" ? (input.locationId ?? ownLocationId) : null,
      detail: {},
      openedAt: NOON,
      resolvedAt: input.resolvedAt ?? null,
    })
    .returning({ id: alerts.id });
  if (!row) throw new Error("test setup: inserting the alert returned no row");
  return row.id;
}

function getAlerts(rawSessionId: string | undefined, query = "") {
  return app.inject({
    method: "GET",
    url: `/alerts${query}`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
  });
}

describe("GET /alerts", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getAlerts(undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 403 forbidden for a user with neither alert-view permission", async () => {
    const roleId = await insertRole([]);
    const userId = await insertUserWithRole(roleId);
    const rawSessionId = await insertSession(userId);

    const response = await getAlerts(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("shows a view_branch_alerts holder only the Local alert of their own branch", async () => {
    const roleId = await insertRole(["view_branch_alerts"]);
    const userId = await insertUserWithRole(roleId);
    const rawSessionId = await insertSession(userId);
    const ownLocalAlertId = await insertAlert({
      kind: "kind_a",
      scope: "scope_a",
      audience: "local",
      locationId: ownLocationId,
    });
    await insertAlert({
      kind: "kind_b",
      scope: "scope_b",
      audience: "local",
      locationId: otherLocationId,
    });
    await insertAlert({ kind: "kind_c", scope: "scope_c", audience: "all" });

    const response = await getAlerts(rawSessionId);

    expect(response.statusCode).toBe(200);
    const body = response.json() as { id: string }[];
    expect(body.map((row) => row.id)).toEqual([ownLocalAlertId]);
  });

  it("shows a view_all_alerts holder every alert regardless of audience or branch", async () => {
    const roleId = await insertRole(["view_all_alerts"]);
    const userId = await insertUserWithRole(roleId);
    const rawSessionId = await insertSession(userId);
    const localAlertId = await insertAlert({
      kind: "kind_a",
      scope: "scope_a",
      audience: "local",
      locationId: otherLocationId,
    });
    const allAlertId = await insertAlert({ kind: "kind_b", scope: "scope_b", audience: "all" });

    const response = await getAlerts(rawSessionId);

    expect(response.statusCode).toBe(200);
    const body = response.json() as { id: string }[];
    expect(body.map((row) => row.id).sort()).toEqual([allAlertId, localAlertId].sort());
  });

  it("filters by level", async () => {
    const roleId = await insertRole(["view_all_alerts"]);
    const userId = await insertUserWithRole(roleId);
    const rawSessionId = await insertSession(userId);
    await insertAlert({ kind: "kind_a", scope: "scope_a", audience: "all", level: "warning" });
    const criticalId = await insertAlert({
      kind: "kind_b",
      scope: "scope_b",
      audience: "all",
      level: "critical",
    });

    const response = await getAlerts(rawSessionId, "?level=critical");

    expect(response.statusCode).toBe(200);
    const body = response.json() as { id: string }[];
    expect(body.map((row) => row.id)).toEqual([criticalId]);
  });

  it("filters by open status", async () => {
    const roleId = await insertRole(["view_all_alerts"]);
    const userId = await insertUserWithRole(roleId);
    const rawSessionId = await insertSession(userId);
    const openId = await insertAlert({ kind: "kind_a", scope: "scope_a", audience: "all" });
    await insertAlert({
      kind: "kind_b",
      scope: "scope_b",
      audience: "all",
      resolvedAt: NOON,
    });

    const openResponse = await getAlerts(rawSessionId, "?open=true");
    const closedResponse = await getAlerts(rawSessionId, "?open=false");

    expect((openResponse.json() as { id: string }[]).map((row) => row.id)).toEqual([openId]);
    expect((closedResponse.json() as { id: string }[]).map((row) => row.id)).not.toContain(openId);
  });
});
