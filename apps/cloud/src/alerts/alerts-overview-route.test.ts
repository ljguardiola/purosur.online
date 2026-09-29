import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import {
  alerts,
  locations,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerAlertsOverviewRoute } from "./alerts-overview-route.js";

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
  registerAlertsOverviewRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

async function signedInViewer(permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: `role-${Math.random()}`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) throw new Error("test setup: inserting the role returned no row");
  for (const permissionKey of permissionKeys) {
    await db.insert(rolePermissions).values({ roleId: role.id, permissionKey });
  }
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: `ada-${Math.random()}@example.com`,
      locationId: ownLocationId,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("test setup: inserting the user returned no row");
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId: user.id,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
  });
  return rawSessionId;
}

async function insertAlert(input: {
  kind: string;
  level: "informational" | "warning" | "critical";
  audience: "local" | "all";
  locationId?: string;
  resolvedAt?: Date;
}): Promise<void> {
  await db.insert(alerts).values({
    kind: input.kind,
    scope: `scope-${Math.random()}`,
    level: input.level,
    audience: input.audience,
    locationId: input.audience === "local" ? (input.locationId ?? ownLocationId) : null,
    detail: {},
    openedAt: NOON,
    resolvedAt: input.resolvedAt ?? null,
  });
}

function getOverview(rawSessionId: string | undefined) {
  return app.inject({
    method: "GET",
    url: "/alerts/overview",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
    },
  });
}

const NOTHING_OPEN = {
  critical: { openCount: 0, kinds: [] },
  warning: { openCount: 0, kinds: [] },
  informational: { openCount: 0, kinds: [] },
};

describe("GET /alerts/overview", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getOverview(undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 403 forbidden for a user with neither alert-view permission", async () => {
    const rawSessionId = await signedInViewer([]);

    const response = await getOverview(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("counts the open alerts of each level and lists the kinds open at it, once each", async () => {
    const rawSessionId = await signedInViewer(["view_all_alerts"]);
    await insertAlert({ kind: "kind_b", level: "critical", audience: "all" });
    await insertAlert({ kind: "kind_a", level: "critical", audience: "all" });
    await insertAlert({ kind: "kind_a", level: "critical", audience: "all" });
    await insertAlert({ kind: "kind_c", level: "warning", audience: "all" });
    await insertAlert({ kind: "kind_d", level: "informational", audience: "all" });
    await insertAlert({
      kind: "kind_e",
      level: "informational",
      audience: "all",
      resolvedAt: NOON,
    });

    const response = await getOverview(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      critical: { openCount: 3, kinds: ["kind_a", "kind_b"] },
      warning: { openCount: 1, kinds: ["kind_c"] },
      informational: { openCount: 1, kinds: ["kind_d"] },
    });
  });

  it("answers every level with nothing open when no alert is open", async () => {
    const rawSessionId = await signedInViewer(["view_all_alerts"]);
    await insertAlert({ kind: "kind_a", level: "critical", audience: "all", resolvedAt: NOON });

    const response = await getOverview(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(NOTHING_OPEN);
  });

  describe("given one Local alert of the viewer's branch, one of another branch and one of All audience", () => {
    beforeEach(async () => {
      await insertAlert({ kind: "kind_local", level: "critical", audience: "local" });
      await insertAlert({
        kind: "kind_other_branch",
        level: "critical",
        audience: "local",
        locationId: otherLocationId,
      });
      await insertAlert({ kind: "kind_all", level: "warning", audience: "all" });
    });

    it("shows a view_branch_alerts holder only the Local alert of their own branch", async () => {
      const rawSessionId = await signedInViewer(["view_branch_alerts"]);

      const response = await getOverview(rawSessionId);

      expect(response.json()).toEqual({
        ...NOTHING_OPEN,
        critical: { openCount: 1, kinds: ["kind_local"] },
      });
    });

    it("shows a view_all_alerts holder every alert", async () => {
      const rawSessionId = await signedInViewer(["view_all_alerts"]);

      const response = await getOverview(rawSessionId);

      expect(response.json()).toEqual({
        ...NOTHING_OPEN,
        critical: { openCount: 2, kinds: ["kind_local", "kind_other_branch"] },
        warning: { openCount: 1, kinds: ["kind_all"] },
      });
    });
  });
});
