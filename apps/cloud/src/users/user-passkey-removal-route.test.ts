import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator, {
  AuthenticatorEmulator,
  PasskeysCredentialsMemoryRepository,
} from "nid-webauthn-emulator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  locations,
  passkeys,
  recoveryTokens,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "../session/passkey-authorization-guard.js";
import { registerSessionAuthenticateRoute } from "../session/session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "../session/session-authentication-options-route.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserPasskeyRemovalRoutes } from "./user-passkey-removal-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let recoveryApp: FastifyInstance;
let authApp: FastifyInstance;
let administratorId: string;
let currentTime: Date;

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
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return administratorRole.id;
}

async function insertCashierRole(name: string): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  return role.id;
}

async function insertUser(input: {
  firstName: string;
  email: string;
  roleId: string;
  locationId: string;
}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: input.firstName, email: input.email, locationId: input.locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

/** Inserts a session, authorized (by default, at `currentTime`) unless `authorizedAt` is passed as `null`. */
async function insertSession(userId: string, authorizedAt: Date | null = NOON): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: authorizedAt,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function postJson(
  target: FastifyInstance,
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return target.inject({
    method: "POST",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
    payload: body,
  });
}

let tokenSequence = 0;

function newDeviceEmulator(): WebAuthnEmulator {
  return new WebAuthnEmulator(
    new AuthenticatorEmulator({ credentialsRepository: new PasskeysCredentialsMemoryRepository() }),
  );
}

/** Registers a real passkey for `forUserId`, backed by `emulator`, through the recovery route. */
async function registerPasskey(
  forUserId: string,
  emulator: WebAuthnEmulator,
  name = "Notebook del local",
): Promise<void> {
  tokenSequence += 1;
  const rawToken = `raw-token-${tokenSequence}`;
  await db.insert(recoveryTokens).values({
    userId: forUserId,
    tokenHash: hashRecoveryToken(rawToken),
    issuedAt: currentTime,
    expiresAt: new Date(currentTime.getTime() + FIFTEEN_MINUTES_MS),
  });
  const optionsResponse = await recoveryApp.inject({
    method: "POST",
    url: "/users/recovery/registration-options",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
    payload: { recovery_token: rawToken },
  });
  if (optionsResponse.statusCode !== 200) {
    throw new Error(
      `test setup: registration-options failed: ${optionsResponse.statusCode} ${optionsResponse.body}`,
    );
  }
  const credential = emulator.createJSON(
    BACKOFFICE_ORIGIN,
    optionsResponse.json().passkey_registration_options,
  );
  const redeemResponse = await recoveryApp.inject({
    method: "POST",
    url: "/users/recovery/redeem",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
    payload: { recovery_token: rawToken, passkey_registration: credential, passkey_name: name },
  });
  if (redeemResponse.statusCode !== 200) {
    throw new Error(
      `test setup: redeem failed: ${redeemResponse.statusCode} ${redeemResponse.body}`,
    );
  }
}

function removePasskey(
  targetId: string,
  passkeyId: string,
  rawSessionId: string | undefined,
  body: Record<string, unknown> = {},
) {
  return postJson(
    app,
    `/users/${targetId}/passkeys/${passkeyId}/remove`,
    body,
    rawSessionId ? cookieHeader(rawSessionId) : {},
  );
}

beforeEach(async () => {
  await testDatabase.clear();
  tokenSequence = 0;

  const locationId = await seededLocationId(db);
  administratorId = await insertUser({
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    roleId: await seededAdministratorRoleId(),
    locationId,
  });

  currentTime = NOON;
  app = Fastify();
  registerUserPasskeyRemovalRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  recoveryApp = Fastify();
  registerRecoveryRedemptionRoutes(recoveryApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  authApp = Fastify();
  registerSessionAuthenticationOptionsRoute(authApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  registerSessionAuthenticateRoute(authApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
  await recoveryApp.close();
  await authApp.close();
});

describe("POST /users/:id/passkeys/:passkeyId/remove", () => {
  let targetEmulatorA: WebAuthnEmulator;
  let cashierRoleId: string;
  let targetId: string;
  let targetPasskeyAId: string;
  let targetPasskeyBId: string;

  beforeEach(async () => {
    cashierRoleId = await insertCashierRole("Cajera");
    targetId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    targetEmulatorA = newDeviceEmulator();
    const targetEmulatorB = newDeviceEmulator();
    await registerPasskey(targetId, targetEmulatorA, "Notebook de Grace");
    await registerPasskey(targetId, targetEmulatorB, "Teléfono de Grace");
    const targetPasskeyRows = await db.select().from(passkeys).where(eq(passkeys.userId, targetId));
    const passkeyA = targetPasskeyRows.find((row) => row.name === "Notebook de Grace");
    const passkeyB = targetPasskeyRows.find((row) => row.name === "Teléfono de Grace");
    if (!passkeyA || !passkeyB) throw new Error("test setup: target passkeys not found");
    targetPasskeyAId = passkeyA.id;
    targetPasskeyBId = passkeyB.id;
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await removePasskey(targetId, targetPasskeyAId, undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: `/users/${targetId}/passkeys/${targetPasskeyAId}/remove`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden, changing nothing", async () => {
    const rawSessionId = await insertSession(targetId);

    const response = await removePasskey(targetId, targetPasskeyAId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, targetId));
    expect(rows).toHaveLength(2);
  });

  it("answers the identical 404 for another branch's target id, a missing one, and a malformed one, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: seeding the other location returned no row");
    const strangerId = await insertUser({
      firstName: "Stranger",
      email: "stranger@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });

    const crossBranchResponse = await removePasskey(strangerId, targetPasskeyAId, rawSessionId);
    const missingResponse = await removePasskey(
      "00000000-0000-0000-0000-000000000000",
      targetPasskeyAId,
      rawSessionId,
    );
    const malformedResponse = await removePasskey("not-a-uuid", targetPasskeyAId, rawSessionId);

    expect(crossBranchResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(crossBranchResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, targetId));
    expect(rows).toHaveLength(2);
  });

  it("rejects the session's own user as the target with 403 own_account, changing nothing", async () => {
    // Registered before the session: redeeming a recovery link (how `registerPasskey` seeds a real
    // credential) ends every session already open on the account.
    await registerPasskey(administratorId, newDeviceEmulator(), "Passkey del admin");
    const rawSessionId = await insertSession(administratorId);
    const [ownPasskey] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, administratorId));
    if (!ownPasskey) throw new Error("test setup: administrator passkey not found");

    const response = await removePasskey(administratorId, ownPasskey.id, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "own_account" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, administratorId));
    expect(rows).toHaveLength(1);
  });

  it("returns not_found for a passkey belonging to another user of the branch reached under the wrong :id, deleting nothing", async () => {
    const otherCashierId = await insertUser({
      firstName: "Barbara Liskov",
      email: "barbara@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    await registerPasskey(otherCashierId, newDeviceEmulator(), "Passkey de Barbara");
    const [otherPasskey] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, otherCashierId));
    if (!otherPasskey) throw new Error("test setup: other passkey not found");
    const rawSessionId = await insertSession(administratorId);

    const response = await removePasskey(targetId, otherPasskey.id, rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.id, otherPasskey.id));
    expect(rows).toHaveLength(1);
  });

  it("returns not_found for a non-existent passkey id", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await removePasskey(
      targetId,
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("returns not_found for a malformed passkey id", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await removePasskey(targetId, "not-a-uuid", rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("returns not_found for a malformed passkey id before asking for an authorization", async () => {
    const rawSessionId = await insertSession(administratorId, null);

    const response = await removePasskey(targetId, "not-a-uuid", rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("removes the named passkey, ends every open session of the target, leaves the Administrator's own session untouched, and audits the actor", async () => {
    const targetSession1 = await insertSession(targetId);
    const targetSession2 = await insertSession(targetId);
    const rawSessionId = await insertSession(administratorId);

    const response = await removePasskey(targetId, targetPasskeyAId, rawSessionId);

    expect(response.statusCode).toBe(200);
    const remaining = await db.select().from(passkeys).where(eq(passkeys.userId, targetId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(targetPasskeyBId);

    const [session1Row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(targetSession1)));
    const [session2Row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(targetSession2)));
    expect(session1Row?.revokedAt).not.toBeNull();
    expect(session2Row?.revokedAt).not.toBeNull();
    const [adminSessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(adminSessionRow?.revokedAt).toBeNull();

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "passkey"));
    const removalAudit = audited.find(
      (row) => (row.previousValue as { id?: string } | null)?.id === targetPasskeyAId,
    );
    expect(removalAudit).toMatchObject({
      actorId: administratorId,
      previousValue: { id: targetPasskeyAId, name: "Notebook de Grace", userId: targetId },
      newValue: null,
    });
  });

  it("the removed passkey can no longer sign the target user in", async () => {
    const rawSessionId = await insertSession(administratorId);
    const response = await removePasskey(targetId, targetPasskeyAId, rawSessionId);
    expect(response.statusCode).toBe(200);

    const optionsResponse = await authApp.inject({
      method: "POST",
      url: "/users/session/authentication-options",
      headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.50" },
    });
    const assertion = targetEmulatorA.getJSON(
      BACKOFFICE_ORIGIN,
      optionsResponse.json().passkey_authentication_options,
    );
    const authenticateResponse = await authApp.inject({
      method: "POST",
      url: "/users/session/authenticate",
      headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.50" },
      payload: { assertion },
    });

    expect(authenticateResponse.statusCode).toBe(401);
    expect(authenticateResponse.json()).toMatchObject({ code: "authentication_failed" });
  });

  it("answers not_found to a second removal of an already removed passkey, auditing only the first", async () => {
    const rawSessionId = await insertSession(administratorId);
    const first = await removePasskey(targetId, targetPasskeyAId, rawSessionId);
    expect(first.statusCode).toBe(200);

    const second = await removePasskey(targetId, targetPasskeyAId, rawSessionId);

    expect(second.statusCode).toBe(404);
    expect(second.json()).toMatchObject({ code: "not_found" });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "passkey"));
    const removals = audited.filter(
      (row) => (row.previousValue as { id?: string } | null)?.id === targetPasskeyAId,
    );
    expect(removals).toHaveLength(1);
  });

  it("allows removing the target's only remaining passkey", async () => {
    const rawSessionId = await insertSession(administratorId);
    const removeFirst = await removePasskey(targetId, targetPasskeyAId, rawSessionId);
    expect(removeFirst.statusCode).toBe(200);

    const response = await removePasskey(targetId, targetPasskeyBId, rawSessionId);

    expect(response.statusCode).toBe(200);
    const remaining = await db.select().from(passkeys).where(eq(passkeys.userId, targetId));
    expect(remaining).toHaveLength(0);
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required and deletes nothing when the session was never authorized", async () => {
      const rawSessionId = await insertSession(administratorId, null);

      const response = await removePasskey(targetId, targetPasskeyAId, rawSessionId);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, targetId));
      expect(rows).toHaveLength(2);
    });

    it("allows the action at exactly the 5-minute boundary", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await removePasskey(targetId, targetPasskeyAId, rawSessionId);

      expect(response.statusCode).toBe(200);
    });

    it("returns 401 authorization_required one second past the 5-minute boundary, deleting nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await removePasskey(targetId, targetPasskeyAId, rawSessionId);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, targetId));
      expect(rows).toHaveLength(2);
    });
  });
});
