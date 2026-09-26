import { and, eq, isNull } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator, {
  AuthenticatorEmulator,
  PasskeysCredentialsMemoryRepository,
} from "nid-webauthn-emulator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { alerts, auditLog, passkeys, recoveryTokens, sessions, users } from "../db/schema.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { exhaustSessionRateLimit } from "../session/exhaust-backoffice-rate-limit.js";
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "../session/passkey-authorization-guard.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerPasskeyRemovalRoutes } from "./passkeys-removal-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

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

/** Inserts a session, authorized (by default, at `currentTime`) unless `authorizedAt` is passed as `null`. */
async function insertSession(forUserId: string, authorizedAt: Date | null = NOON): Promise<string> {
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

function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
    payload: body,
  });
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

describe("POST /users/passkeys/:id/remove", () => {
  let emulatorA: WebAuthnEmulator;
  let emulatorB: WebAuthnEmulator;

  beforeEach(async () => {
    emulatorA = newDeviceEmulator();
    emulatorB = newDeviceEmulator();
    await registerPasskey(userId, emulatorA, "Notebook del local");
    await registerPasskey(userId, emulatorB, "Teléfono del local");

    // Redeeming the two setup passkeys above already opened (and, on the second, deduped into) the
    // account's own backoffice_passkey_changed alert; closing it here keeps each test's own
    // assertions about that alert free of this setup's side effect.
    await db
      .update(alerts)
      .set({ resolvedAt: currentTime, resolvedBy: userId })
      .where(eq(alerts.scope, userId));
  });

  function removePasskey(rawSessionId: string, targetId: string) {
    return postJson(`/users/passkeys/${targetId}/remove`, {}, cookieHeader(rawSessionId));
  }

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));

    const response = await postJson(`/users/passkeys/${target?.id}/remove`, {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));

    const response = await app.inject({
      method: "POST",
      url: `/users/passkeys/${target?.id}/remove`,
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
    expect(response.headers["retry-after"]).toBe("3600");
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

  it("returns not_found for a malformed passkey id", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await removePasskey(rawSessionId, "not-a-uuid");

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required and deletes nothing when the session was never authorized", async () => {
      const rawSessionId = await insertSession(userId, null);
      const [target] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      if (!target) throw new Error("test setup: target passkey not found");

      const response = await removePasskey(rawSessionId, target.id);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      expect(rows).toHaveLength(2);
    });

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
  });
});
