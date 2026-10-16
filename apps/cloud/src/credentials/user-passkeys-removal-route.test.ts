import { PASSKEY_AUTHORIZATION_WINDOW_MS, RECOVERY_TOKEN_LIFETIME_MS } from "@purosur/domain";
import { and, eq, isNull } from "drizzle-orm";

import Fastify, { type FastifyInstance } from "fastify";
import {
  AuthenticatorEmulator,
  PasskeysCredentialsMemoryRepository,
  WebAuthnEmulator,
} from "nid-webauthn-emulator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  passkeys,
  recoveryTokens,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { AUTHORIZATION_REQUIRED_RESPONSE } from "./passkey-authorization-guard.js";
import { registerRecoveryRedemptionRoutes } from "./recovery-redemption-route.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { registerSessionAuthenticateRoute } from "./session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "./session-authentication-options-route.js";
import { registerUserPasskeysRemovalRoute } from "./user-passkeys-removal-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

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

function deleteRequest(target: FastifyInstance, url: string, headers: Record<string, string> = {}) {
  return target.inject({
    method: "DELETE",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
  });
}

let tokenSequence = 0;

function newDeviceEmulator(): WebAuthnEmulator {
  return new WebAuthnEmulator(
    new AuthenticatorEmulator({ credentialsRepository: new PasskeysCredentialsMemoryRepository() }),
  );
}

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
    expiresAt: new Date(currentTime.getTime() + RECOVERY_TOKEN_LIFETIME_MS),
  });
  const optionsResponse = await recoveryApp.inject({
    method: "POST",
    url: "/account-recovery-challenges",
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
    url: "/account-recovery-redemptions",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
    payload: { recovery_token: rawToken, passkey_registration: credential, passkey_name: name },
  });
  if (redeemResponse.statusCode !== 200) {
    throw new Error(
      `test setup: redeem failed: ${redeemResponse.statusCode} ${redeemResponse.body}`,
    );
  }
}

function removeEveryPasskey(targetId: string, rawSessionId: string | undefined) {
  return deleteRequest(
    app,
    `/users/${targetId}/passkeys`,
    rawSessionId ? cookieHeader(rawSessionId) : {},
  );
}

beforeEach(async () => {
  await testDatabase.clear();
  tokenSequence = 0;

  const locationId = await seededLocationId(db);
  administratorId = await insertUser({
    firstName: "Ada Lucero",
    email: "ada@example.com",
    roleId: await seededAdministratorRoleId(),
    locationId,
  });

  currentTime = NOON;
  app = Fastify();
  registerUserPasskeysRemovalRoute(app, {
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

describe("DELETE /users/:id/passkeys", () => {
  let cashierRoleId: string;
  let targetId: string;
  let otherCashierId: string;

  beforeEach(async () => {
    cashierRoleId = await insertCashierRole("Cajera");
    const locationId = await seededLocationId(db);
    targetId = await insertUser({
      firstName: "Grace Villalba",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    otherCashierId = await insertUser({
      firstName: "Barbara Quintana",
      email: "barbara@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    await registerPasskey(targetId, newDeviceEmulator(), "Notebook de Grace");
    await registerPasskey(targetId, newDeviceEmulator(), "Teléfono de Grace");

    await db
      .update(alerts)
      .set({ resolvedAt: currentTime, resolvedBy: administratorId })
      .where(eq(alerts.kind, "backoffice_passkey_changed"));
  });

  function passkeysOf(userId: string) {
    return db.select().from(passkeys).where(eq(passkeys.userId, userId));
  }

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await removeEveryPasskey(targetId, undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "DELETE",
      url: `/users/${targetId}/passkeys`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden, changing nothing", async () => {
    const rawSessionId = await insertSession(otherCashierId);

    const response = await removeEveryPasskey(targetId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await passkeysOf(targetId)).toHaveLength(2);
  });

  it("answers 400 validation_failed naming id for a malformed target id", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await removeEveryPasskey("not-a-uuid", rawSessionId);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
  });

  it("answers 401 authorization_required without a recent passkey authorization, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId, null);

    const response = await removeEveryPasskey(targetId, rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(AUTHORIZATION_REQUIRED_RESPONSE);
    expect(await passkeysOf(targetId)).toHaveLength(2);
  });

  it("answers 401 authorization_required once the authorization is older than its window", async () => {
    const rawSessionId = await insertSession(administratorId);
    currentTime = new Date(NOON.getTime() + PASSKEY_AUTHORIZATION_WINDOW_MS + 1);

    const response = await removeEveryPasskey(targetId, rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(AUTHORIZATION_REQUIRED_RESPONSE);
    expect(await passkeysOf(targetId)).toHaveLength(2);
  });

  it("answers 404 not_found for a missing target and for a deactivated one, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    await db.update(users).set({ active: false }).where(eq(users.id, targetId));

    const deactivated = await removeEveryPasskey(targetId, rawSessionId);
    const missing = await removeEveryPasskey("00000000-0000-0000-0000-000000000000", rawSessionId);

    expect(deactivated.statusCode).toBe(404);
    expect(deactivated.json()).toMatchObject({ code: "not_found" });
    expect(missing.statusCode).toBe(404);
    expect(deactivated.json()).toEqual(missing.json());
    expect(await passkeysOf(targetId)).toHaveLength(2);
  });

  it("answers 403 own_account for the session's own user, changing nothing", async () => {
    await registerPasskey(administratorId, newDeviceEmulator(), "Passkey del admin");
    const rawSessionId = await insertSession(administratorId);

    const response = await removeEveryPasskey(administratorId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "own_account" });
    expect(await passkeysOf(administratorId)).toHaveLength(1);
  });

  it("answers 409 no_passkeys for an account without passkeys, changing nothing", async () => {
    const withoutPasskeysId = await insertUser({
      firstName: "Hedy Ledesma",
      email: "hedy@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const auditsBefore = await db.select().from(auditLog);

    const response = await removeEveryPasskey(withoutPasskeysId, rawSessionId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "no_passkeys" });
    expect(await db.select().from(auditLog)).toEqual(auditsBefore);
  });

  it("answers 200 once every passkey of the chosen account is removed", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await removeEveryPasskey(targetId, rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(await passkeysOf(targetId)).toEqual([]);
  });

  it("audits each removed passkey with the Administrator as actor", async () => {
    const before = await passkeysOf(targetId);
    const rawSessionId = await insertSession(administratorId);

    await removeEveryPasskey(targetId, rawSessionId);

    const audits = await db.select().from(auditLog).where(eq(auditLog.entity, "passkey"));
    const removedAudits = audits.filter((audit) => audit.newValue === null);
    expect(removedAudits.map((audit) => audit.entityId).sort()).toEqual(
      before.map((passkey) => passkey.id).sort(),
    );
    expect(removedAudits.every((audit) => audit.actorId === administratorId)).toBe(true);
  });

  it("opens one passkey-changed alert for the chosen account", async () => {
    const rawSessionId = await insertSession(administratorId);

    await removeEveryPasskey(targetId, rawSessionId);

    expect(
      await db
        .select()
        .from(alerts)
        .where(and(eq(alerts.scope, targetId), isNull(alerts.resolvedAt))),
    ).toMatchObject([
      { kind: "backoffice_passkey_changed", detail: { action: "removed", via: "administrator" } },
    ]);
  });
});
