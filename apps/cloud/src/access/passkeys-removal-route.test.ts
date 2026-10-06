import {
  BACKOFFICE_REQUEST_WINDOW_MS,
  PASSKEY_AUTHORIZATION_WINDOW_MS,
  RECOVERY_TOKEN_LIFETIME_MS,
} from "@purosur/domain";
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
  sessions,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerPasskeyRemovalRoutes } from "./passkeys-removal-route.js";
import { registerRecoveryRedemptionRoutes } from "./recovery-redemption-route.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { exhaustSessionRateLimit } from "./test-support/exhaust-backoffice-rate-limit.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let recoveryApp: FastifyInstance;
let userId: string;
let currentTime: Date;

async function buildApp() {
  const built = Fastify();
  registerPasskeyRemovalRoutes(built, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  return built;
}

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("seeding the test user returned no row");
  }
  userId = user.id;

  currentTime = NOON;
  app = await buildApp();
  recoveryApp = Fastify();
  registerRecoveryRedemptionRoutes(recoveryApp, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
  await recoveryApp.close();
});

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

async function insertSession(forUserId: string, authorizedAt: Date = NOON): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId: forUserId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: authorizedAt,
  });
  return rawSessionId;
}

function deleteRequest(url: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: "DELETE",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
  });
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

describe("DELETE /account/passkeys/:id", () => {
  let emulatorA: WebAuthnEmulator;
  let emulatorB: WebAuthnEmulator;

  beforeEach(async () => {
    emulatorA = newDeviceEmulator();
    emulatorB = newDeviceEmulator();
    await registerPasskey(userId, emulatorA, "Notebook del local");
    await registerPasskey(userId, emulatorB, "Teléfono del local");

    await db
      .update(alerts)
      .set({ resolvedAt: currentTime, resolvedBy: userId })
      .where(eq(alerts.scope, userId));
  });

  function removePasskey(rawSessionId: string, targetId: string) {
    return deleteRequest(`/account/passkeys/${targetId}`, cookieHeader(rawSessionId));
  }

  it("no longer answers the old removal path", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));

    const response = await app.inject({
      method: "POST",
      url: `/users/passkeys/${target?.id}/remove`,
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));

    const response = await deleteRequest(`/account/passkeys/${target?.id}`);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));

    const response = await app.inject({
      method: "DELETE",
      url: `/account/passkeys/${target?.id}`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 429 rate_limited with Retry-After once the session is over its backoffice request limit, removing nothing", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    if (!target) throw new Error("test setup: target passkey not found");
    await exhaustSessionRateLimit(db, rawSessionId, currentTime);

    const response = await removePasskey(rawSessionId, target.id);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe(String(BACKOFFICE_REQUEST_WINDOW_MS / 1000));
    const [stillThere] = await db.select().from(passkeys).where(eq(passkeys.id, target.id));
    expect(stillThere).toBeDefined();
  });

  it("removes the named passkey, writing an audit row", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");

    const response = await removePasskey(rawSessionId, target.id);

    expect(response.statusCode).toBe(200);
    const remaining = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.name).toBe("Notebook del local");

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "passkey"));
    const removalAudit = audited.find(
      (row) => (row.previousValue as { id?: string } | null)?.id === target.id,
    );
    expect(removalAudit).toMatchObject({
      actorId: userId,
      previousValue: { id: target.id, name: "Teléfono del local" },
      newValue: null,
      at: currentTime,
    });
  });

  it("opens a backoffice_passkey_changed alert scoped to the account", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");

    const response = await removePasskey(rawSessionId, target.id);

    expect(response.statusCode).toBe(200);
    const opened = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.kind, "backoffice_passkey_changed"), isNull(alerts.resolvedAt)));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      scope: userId,
      audience: "all",
      level: "warning",
      resolvedAt: null,
      detail: {
        action: "removed",
        passkeyName: "Teléfono del local",
        actorId: userId,
        via: "self",
      },
    });
  });

  it("opens no alert for a removal that answers not_found, deleting nothing", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await removePasskey(rawSessionId, "00000000-0000-0000-0000-000000000000");

    expect(response.statusCode).toBe(404);
    const opened = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.kind, "backoffice_passkey_changed"), isNull(alerts.resolvedAt)));
    expect(opened).toHaveLength(0);
  });

  it("allows the passkey that authorized the session to be the one removed", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Notebook del local"));
    if (!target) throw new Error("test setup: target passkey not found");

    const response = await removePasskey(rawSessionId, target.id);

    expect(response.statusCode).toBe(200);
    const remaining = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(remaining).toHaveLength(1);
  });

  it("allows removing the account's only remaining passkey", async () => {
    const rawSessionId = await insertSession(userId);
    const [firstTarget] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!firstTarget) throw new Error("test setup: target passkey not found");
    const removeFirst = await removePasskey(rawSessionId, firstTarget.id);
    expect(removeFirst.statusCode).toBe(200);
    const [lastTarget] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    if (!lastTarget) throw new Error("test setup: last passkey not found");

    const response = await removePasskey(rawSessionId, lastTarget.id);

    expect(response.statusCode).toBe(200);
    const remaining = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(remaining).toHaveLength(0);
  });

  it("does not revoke the session on a successful removal", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");

    await removePasskey(rawSessionId, target.id);

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.revokedAt).toBeNull();
  });

  it("returns not_found for a passkey id belonging to another account, deleting nothing", async () => {
    const [strangerUser] = await db
      .insert(users)
      .values({
        firstName: "Grace Hopper",
        email: "grace@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!strangerUser) throw new Error("test setup: seeding the stranger user returned no row");
    const strangerEmulator = newDeviceEmulator();
    await registerPasskey(strangerUser.id, strangerEmulator, "Passkey de Grace");
    const [strangerPasskey] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, strangerUser.id));
    if (!strangerPasskey) throw new Error("test setup: stranger passkey not found");
    const rawSessionId = await insertSession(userId);

    const response = await removePasskey(rawSessionId, strangerPasskey.id);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.id, strangerPasskey.id));
    expect(rows).toHaveLength(1);
  });

  it("returns not_found for a non-existent passkey id", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await removePasskey(rawSessionId, "00000000-0000-0000-0000-000000000000");

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 400 validation_failed naming id for a malformed passkey id, deleting nothing", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await removePasskey(rawSessionId, "not-a-uuid");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("answers 400 validation_failed for a malformed passkey id before asking for an authorization, deleting nothing", async () => {
    const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
    const rawSessionId = await insertSession(userId, authorizedAt);

    const response = await removePasskey(rawSessionId, "not-a-uuid");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  describe("the passkey authorization a removal requires", () => {
    it("returns 401 authorization_required when the session's passkey authorization is stale, deleting nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(userId, authorizedAt);
      const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      if (!target) throw new Error("test setup: target passkey not found");

      const response = await removePasskey(rawSessionId, target.id);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      expect(rows).toHaveLength(2);
    });

    it("returns 401 authorization_required for a well-formed passkey id that does not exist when the session's passkey authorization is stale, deleting nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(userId, authorizedAt);

      const response = await removePasskey(rawSessionId, "00000000-0000-0000-0000-000000000000");

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      expect(rows).toHaveLength(2);
    });
  });
});
