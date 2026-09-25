import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator from "nid-webauthn-emulator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { alerts, roles, sessions, userRoles, users } from "../db/schema.js";
import { registerPasskeyRegistrationRoutes } from "../passkeys/passkeys-registration-route.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserEditRoutes } from "../users/user-edit-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let editApp: FastifyInstance;
let passkeysApp: FastifyInstance;
let administratorId: string;
let targetId: string;
let cashierRoleId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function seededAdministratorRoleId(): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) throw new Error("test setup: no Administrator role seeded");
  return administratorRole.id;
}

async function insertUser(input: { firstName: string; email: string; roleId: string }) {
  const locationId = await seededLocationId(db);
  const [user] = await db
    .insert(users)
    .values({ firstName: input.firstName, email: input.email, locationId })
    .returning({ id: users.id });
  if (!user) throw new Error("test setup: seeding the user returned no row");
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

async function insertAuthorizedSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: NOON,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

beforeEach(async () => {
  await testDatabase.clear();

  const cashierRoleRow = await db
    .insert(roles)
    .values({ name: "Cajera", isAdministrator: false })
    .returning({ id: roles.id });
  cashierRoleId = cashierRoleRow[0]?.id ?? "";
  administratorId = await insertUser({
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    roleId: await seededAdministratorRoleId(),
  });
  targetId = await insertUser({
    firstName: "Grace Hopper",
    email: "grace@example.com",
    roleId: cashierRoleId,
  });

  editApp = Fastify();
  registerUserEditRoutes(editApp, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
  passkeysApp = Fastify();
  registerPasskeyRegistrationRoutes(passkeysApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await editApp.close();
  await passkeysApp.close();
});

describe("an email change and a later passkey change for the same person, the same night", () => {
  it("opens two separate alerts, one per kind, both scoped to the person and neither resolving the other", async () => {
    const administratorSessionId = await insertAuthorizedSession(administratorId);
    const editResponse = await editApp.inject({
      method: "POST",
      url: `/users/${targetId}/edit`,
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(administratorSessionId) },
      payload: { email: "new.email@example.com", role_id: cashierRoleId, version: 1 },
    });
    expect(editResponse.statusCode).toBe(200);

    const targetSessionId = await insertAuthorizedSession(targetId);
    const optionsResponse = await passkeysApp.inject({
      method: "POST",
      url: "/users/passkeys/registration-options",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(targetSessionId) },
    });
    expect(optionsResponse.statusCode).toBe(200);
    const emulator = new WebAuthnEmulator();
    const passkeyRegistration = emulator.createJSON(
      BACKOFFICE_ORIGIN,
      optionsResponse.json().passkey_registration_options,
    );
    const registerResponse = await passkeysApp.inject({
      method: "POST",
      url: "/users/passkeys",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(targetSessionId) },
      payload: { passkey_registration: passkeyRegistration, passkey_name: "Notebook de Grace" },
    });
    expect(registerResponse.statusCode).toBe(200);

    const opened = await db.select().from(alerts).where(eq(alerts.scope, targetId));
    expect(opened).toHaveLength(2);
    expect(opened.map((row) => row.kind).sort()).toEqual([
      "backoffice_passkey_changed",
      "user_email_changed",
    ]);
    for (const row of opened) {
      expect(row.audience).toBe("all");
      expect(row.resolvedAt).toBeNull();
    }
  });
});
