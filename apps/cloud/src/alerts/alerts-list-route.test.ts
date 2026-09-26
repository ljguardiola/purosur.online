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
  openedAt?: Date;
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
      openedAt: input.openedAt ?? NOON,
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

interface ListBody {
  alerts: { id: string; kind: string; scope: string; scope_display: string | null }[];
  total: number;
  page_size: number;
  open_count: number;
  open_critical_count: number;
}

function listBody(response: { json: () => unknown }): ListBody {
  return response.json() as ListBody;
}

async function signedInViewer(permissionKeys: string[] = ["view_all_alerts"]): Promise<string> {
  const roleId = await insertRole(permissionKeys);
  const userId = await insertUserWithRole(roleId);
  return insertSession(userId);
}

function minutesBeforeNoon(minutes: number): Date {
  return new Date(NOON.getTime() - minutes * 60 * 1000);
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
    const body = listBody(response).alerts;
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
    const body = listBody(response).alerts;
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
    const body = listBody(response).alerts;
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

    expect(listBody(openResponse).alerts.map((row) => row.id)).toEqual([openId]);
    expect(listBody(closedResponse).alerts.map((row) => row.id)).not.toContain(openId);
  });

  it("shows a user-scoped alert's scope_display as that user's first name", async () => {
    const roleId = await insertRole(["view_all_alerts"]);
    const viewerId = await insertUserWithRole(roleId);
    const rawSessionId = await insertSession(viewerId);
    const targetRoleId = await insertRole([]);
    const targetId = await insertUserWithRole(targetRoleId);
    await insertAlert({ kind: "user_email_changed", scope: targetId, audience: "all" });

    const response = await getAlerts(rawSessionId);

    expect(response.statusCode).toBe(200);
    const body = listBody(response).alerts;
    expect(body).toEqual([
      expect.objectContaining({
        kind: "user_email_changed",
        scope: targetId,
        scope_display: "Ada",
      }),
    ]);
  });

  it("falls back to the raw scope for a kind outside the catalog, e.g. a source address", async () => {
    const roleId = await insertRole(["view_all_alerts"]);
    const userId = await insertUserWithRole(roleId);
    const rawSessionId = await insertSession(userId);
    await insertAlert({
      kind: "backoffice_sign_in_lockout",
      scope: "203.0.113.5",
      audience: "all",
    });

    const response = await getAlerts(rawSessionId);

    expect(response.statusCode).toBe(200);
    const body = listBody(response).alerts;
    expect(body).toEqual([expect.objectContaining({ scope_display: "203.0.113.5" })]);
  });

  it("answers one page of alerts, newest first, with the total that matched", async () => {
    const rawSessionId = await signedInViewer();
    const ids: string[] = [];
    for (let index = 0; index < 30; index += 1) {
      ids.push(
        await insertAlert({
          kind: "kind_a",
          scope: `scope_${index}`,
          audience: "all",
          openedAt: minutesBeforeNoon(index),
        }),
      );
    }

    const firstPage = listBody(await getAlerts(rawSessionId));
    const secondPage = listBody(await getAlerts(rawSessionId, "?page=2"));

    expect(firstPage.page_size).toBe(25);
    expect(firstPage.total).toBe(30);
    expect(firstPage.alerts.map((row) => row.id)).toEqual(ids.slice(0, 25));
    expect(secondPage.alerts.map((row) => row.id)).toEqual(ids.slice(25));
  });

  it("answers the first page for a page that isn't a positive whole number", async () => {
    const rawSessionId = await signedInViewer();
    const alertId = await insertAlert({ kind: "kind_a", scope: "scope_a", audience: "all" });

    for (const page of ["0", "-1", "abc", "1.5"]) {
      const body = listBody(await getAlerts(rawSessionId, `?page=${page}`));
      expect(body.alerts.map((row) => row.id)).toEqual([alertId]);
    }
  });

  it("counts every open visible alert and its critical ones, whatever the filters or page", async () => {
    const rawSessionId = await signedInViewer(["view_branch_alerts"]);
    await insertAlert({ kind: "kind_a", scope: "scope_a", audience: "local", level: "critical" });
    await insertAlert({ kind: "kind_b", scope: "scope_b", audience: "local", level: "warning" });
    await insertAlert({
      kind: "kind_c",
      scope: "scope_c",
      audience: "local",
      level: "critical",
      resolvedAt: NOON,
    });
    await insertAlert({
      kind: "kind_d",
      scope: "scope_d",
      audience: "local",
      level: "critical",
      locationId: otherLocationId,
    });

    const body = listBody(await getAlerts(rawSessionId, "?open=false&level=informational&page=3"));

    expect(body.open_count).toBe(2);
    expect(body.open_critical_count).toBe(1);
  });

  it("searches by a user-scoped alert's first name", async () => {
    const rawSessionId = await signedInViewer();
    const targetRoleId = await insertRole([]);
    const targetId = await insertUserWithRole(targetRoleId);
    const matchingId = await insertAlert({
      kind: "user_email_changed",
      scope: targetId,
      audience: "all",
    });
    await insertAlert({
      kind: "backoffice_sign_in_lockout",
      scope: "203.0.113.5",
      audience: "all",
    });

    const body = listBody(await getAlerts(rawSessionId, "?q=ad"));

    expect(body.alerts.map((row) => row.id)).toEqual([matchingId]);
    expect(body.total).toBe(1);
  });

  it("searches by any of the given kinds", async () => {
    const rawSessionId = await signedInViewer();
    const matchingId = await insertAlert({
      kind: "backoffice_recovery_requested",
      scope: "scope_a",
      audience: "all",
    });
    await insertAlert({ kind: "user_email_changed", scope: "scope_b", audience: "all" });

    const body = listBody(
      await getAlerts(rawSessionId, "?q=recu&kinds=backoffice_recovery_requested"),
    );

    expect(body.alerts.map((row) => row.id)).toEqual([matchingId]);
  });

  it("rejects a repeated query key as bad input", async () => {
    const rawSessionId = await signedInViewer();

    for (const query of ["?q=a&q=b", "?q=a&kinds=kind_a&kinds=kind_b"]) {
      const response = await getAlerts(rawSessionId, query);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation_failed" });
    }
  });

  it("searches by an open lockout alert's source address, taking the text literally", async () => {
    const rawSessionId = await signedInViewer();
    const matchingId = await insertAlert({
      kind: "backoffice_sign_in_lockout",
      scope: "203.0.113.5",
      audience: "all",
    });
    await insertAlert({
      kind: "backoffice_sign_in_lockout",
      scope: "198.51.100.7",
      audience: "all",
    });

    const matching = listBody(await getAlerts(rawSessionId, "?q=113.5"));
    const wildcard = listBody(await getAlerts(rawSessionId, "?q=%25"));

    expect(matching.alerts.map((row) => row.id)).toEqual([matchingId]);
    expect(wildcard.alerts).toEqual([]);
  });
});
