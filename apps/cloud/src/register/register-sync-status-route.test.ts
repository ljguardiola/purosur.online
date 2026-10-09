import { registerSyncStatusListSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  deviceState,
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
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRegisterSyncStatusRoute } from "./register-sync-status-route.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const MORNING = new Date("2026-01-05T09:15:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let ownLocationId: string;

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
  app = Fastify();
  registerRegisterSyncStatusRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
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

function getSyncStatus(rawSessionId: string | undefined, headers: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: "/registers/sync-status",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      ...headers,
    },
  });
}

describe("GET /registers/sync-status", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getSyncStatus(undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await signedInViewer([]);

    const response = await getSyncStatus(rawSessionId, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("lists the session's branch registers with their last successful sync for any signed-in user, whatever the permissions", async () => {
    const synced = await insertEnrolledInstallation(db, { now: NOON, registerName: "Caja 2" });
    await db.insert(deviceState).values({ deviceId: synced.deviceId, lastAcceptedPushAt: MORNING });
    await insertEnrolledInstallation(db, { now: NOON, registerName: "Caja 1" });
    const rawSessionId = await signedInViewer([]);

    const response = await getSyncStatus(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(registerSyncStatusListSchema.parse(response.json())).toEqual([
      { id: expect.any(String), name: "Caja 1", last_successful_sync_at: null },
      { id: synced.registerId, name: "Caja 2", last_successful_sync_at: MORNING.toISOString() },
    ]);
  });

  it("lists no register of another branch", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: inserting the other location returned no row");
    await db.insert(registers).values({ locationId: otherLocation.id, name: "Caja ajena" });
    const rawSessionId = await signedInViewer([]);

    const response = await getSyncStatus(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});
