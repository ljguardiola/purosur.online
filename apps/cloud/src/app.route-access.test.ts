import { CAPABILITY_PERMISSIONS, PERMISSION_KEYS, type PermissionKey } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { rolePermissions, roles, sessions, userRoles, users } from "./platform/db/schema.js";
import type { RouteAccess, RouteAccessEntry } from "./sessions/route-access.js";
import { SESSION_COOKIE_NAME } from "./sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "./sessions/session-id.js";
import {
  APP_CLOCK,
  BACKOFFICE_ORIGIN,
  buildProductionWiredApp,
  removeProductionStaticDirs,
} from "./test-support/app.js";
import { buildTestDatabase } from "./test-support/build-test-database.js";
import { seededLocationId } from "./test-support/seeded-location.js";

const testDatabase = await buildTestDatabase();
const app = buildProductionWiredApp(testDatabase.db);
await app.ready();
const declaredRoutes = app.routeAccessInventory();

afterAll(async () => {
  await app.close();
  await testDatabase.close();
  removeProductionStaticDirs();
});

describe("every route enforces the access it declares", () => {
  const ENDED_BEFORE = new Date("2020-01-01T00:00:00.000Z");

  function routesDeclaring(levels: RouteAccess["level"][]) {
    return declaredRoutes.filter(
      (route) => route.access !== undefined && levels.includes(route.access.level),
    );
  }

  function resolvedPath(url: string): string {
    return url.replace(/:\w+/g, "00000000-0000-0000-0000-000000000000").replace(/\*$/, "help");
  }

  function send(route: RouteAccessEntry, rawSessionId?: string) {
    return app.inject({
      method: route.method as "GET" | "HEAD" | "POST",
      url: resolvedPath(route.url),
      headers: {
        origin: BACKOFFICE_ORIGIN,
        ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      },
    });
  }

  function codeOf(body: string): unknown {
    try {
      return (JSON.parse(body) as { code?: unknown }).code;
    } catch {
      return undefined;
    }
  }

  async function signedInWithRole(permissionKeys: readonly string[]): Promise<string> {
    const db = testDatabase.db;
    const [role] = await db
      .insert(roles)
      .values({ name: `Rol ${generateSessionId()}`, isAdministrator: false })
      .returning({ id: roles.id });
    if (!role) {
      throw new Error("test setup: seeding the role returned no row");
    }
    if (permissionKeys.length > 0) {
      await db
        .insert(rolePermissions)
        .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
    }
    const [user] = await db
      .insert(users)
      .values({
        firstName: "Grace Villalba",
        email: `${generateSessionId()}@example.com`,
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
    const rawSessionId = generateSessionId();
    await db.insert(sessions).values({
      userId: user.id,
      sessionIdHash: hashSessionId(rawSessionId),
      createdAt: APP_CLOCK,
      lastSeenAt: APP_CLOCK,
    });
    return rawSessionId;
  }

  it("sweeps every access level a route declares", () => {
    const declaredLevels = new Set(declaredRoutes.map((route) => route.access?.level));

    expect(declaredLevels).toEqual(
      new Set([
        "public",
        "open_session",
        "open_session_peek",
        "session_cookie",
        "capability",
        "record",
        "release_check",
        "offsite_dump_check",
      ]),
    );
  });

  describe("answers 401 unauthenticated on every token route without its token", () => {
    it.each(routesDeclaring(["release_check", "offsite_dump_check"]))("$method $url", async (route) => {
      const response = await send(route);

      expect(response.statusCode, `responded ${response.statusCode}, body: ${response.body}`).toBe(
        401,
      );
      expect(response.json()).toMatchObject({ code: "unauthenticated" });
    });
  });

  describe("lets every public route through without a session", () => {
    it.each(routesDeclaring(["public"]))("$method $url", async (route) => {
      const response = await send(route);

      expect(
        ["unauthenticated", "forbidden"].includes(String(codeOf(response.body))),
        `responded ${response.statusCode}, body: ${response.body}`,
      ).toBe(false);
    });
  });

  describe("answers 401 unauthenticated on every session route without a session", () => {
    it.each(
      routesDeclaring([
        "open_session",
        "open_session_peek",
        "session_cookie",
        "capability",
        "record",
      ]),
    )("$method $url", async (route) => {
      const response = await send(route);

      expect(response.statusCode, `responded ${response.statusCode}, body: ${response.body}`).toBe(
        401,
      );
      expect(response.json()).toMatchObject({ code: "unauthenticated" });
    });
  });

  describe("answers 401 unauthenticated on every open-session route to an already ended session", () => {
    it.each(routesDeclaring(["open_session", "open_session_peek", "record"]))(
      "$method $url",
      async (route) => {
        const rawSessionId = await signedInWithRole([]);
        await testDatabase.db
          .update(sessions)
          .set({ createdAt: ENDED_BEFORE, lastSeenAt: ENDED_BEFORE })
          .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));

        const response = await send(route, rawSessionId);

        expect(
          response.statusCode,
          `responded ${response.statusCode}, body: ${response.body}`,
        ).toBe(401);
      },
    );
  });

  describe("answers 403 forbidden on every capability route to a user missing every permission of its capability", () => {
    it.each(routesDeclaring(["capability"]))("$method $url", async (route) => {
      const access = route.access as Extract<RouteAccess, { level: "capability" }>;
      const capabilityPermissions: readonly PermissionKey[] =
        CAPABILITY_PERMISSIONS[access.capability];
      const rawSessionId = await signedInWithRole(
        PERMISSION_KEYS.filter((key) => !capabilityPermissions.includes(key)),
      );

      const response = await send(route, rawSessionId);

      expect(response.statusCode, `responded ${response.statusCode}, body: ${response.body}`).toBe(
        403,
      );
      expect(response.json()).toMatchObject({ code: "forbidden" });
    });
  });

  describe("answers 403 forbidden on every record route to a user without permissions aiming at another person's record", () => {
    it.each(routesDeclaring(["record"]))("$method $url", async (route) => {
      const rawSessionId = await signedInWithRole([]);

      const response = await send(route, rawSessionId);

      expect(response.statusCode, `responded ${response.statusCode}, body: ${response.body}`).toBe(
        403,
      );
      expect(response.json()).toMatchObject({ code: "forbidden" });
    });
  });
});
