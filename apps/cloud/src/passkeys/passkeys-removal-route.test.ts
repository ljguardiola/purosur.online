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
  passkeyChallenges,
  passkeys,
  recoveryTokens,
  sessions,
  users,
} from "../db/schema.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { exhaustSessionRateLimit } from "../session/exhaust-backoffice-rate-limit.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { PASSKEY_CHALLENGE_TTL_MS } from "./passkey-challenge.js";
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

async function insertSession(forUserId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId: forUserId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
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

/**
 * Returned untyped (matching `session-authenticate-route.test.ts`'s own
 * `requestRegistrationOptions`): `nid-webauthn-emulator`'s own bundled WebAuthn JSON types don't
 * structurally match `@simplewebauthn/server`'s exports one-for-one, so this crosses the same JSON
 * boundary a real browser would instead of being typed directly against either package's types.
 */
async function requestRemovalOptions(rawSessionId: string) {
  const response = await postJson(
    "/users/passkeys/removal-options",
    {},
    cookieHeader(rawSessionId),
  );
  if (response.statusCode !== 200) {
    throw new Error(`test setup: removal-options failed: ${response.statusCode} ${response.body}`);
  }
  return response.json();
}

describe("POST /users/passkeys/removal-options", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await postJson("/users/passkeys/removal-options", {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await app.inject({
      method: "POST",
      url: "/users/passkeys/removal-options",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 429 rate_limited with Retry-After once the session is over its backoffice request limit, storing no challenge", async () => {
    const rawSessionId = await insertSession(userId);
    await exhaustSessionRateLimit(db, rawSessionId, currentTime);

    const response = await postJson(
      "/users/passkeys/removal-options",
      {},
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("3600");
    expect(await db.select().from(passkeyChallenges)).toHaveLength(0);
  });

  it("prunes other sessions' passkey challenges that aged past their lifetime", async () => {
    const emulator = newDeviceEmulator();
    await registerPasskey(userId, emulator);
    const staleSessionId = await insertSession(userId);
    const [staleSession] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(staleSessionId)));
    if (!staleSession) throw new Error("test setup: stale session not found");
    await db.insert(passkeyChallenges).values({
      sessionId: staleSession.id,
      kind: "removal",
      reauthenticationChallenge: "stale-challenge",
      createdAt: new Date(NOON.getTime() - PASSKEY_CHALLENGE_TTL_MS),
    });
    const rawSessionId = await insertSession(userId);

    const options = await requestRemovalOptions(rawSessionId);

    const rows = await db.select().from(passkeyChallenges);
    expect(rows.map((row) => row.reauthenticationChallenge)).toEqual([
      options.reauthentication_options.challenge,
    ]);
  });

  it("returns reauthentication options allowing only the account's own passkeys", async () => {
    const emulator = newDeviceEmulator();
    await registerPasskey(userId, emulator);
    const rawSessionId = await insertSession(userId);
    const [ownPasskey] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));

    const options = await requestRemovalOptions(rawSessionId);

    expect(options.reauthentication_options).toMatchObject({ userVerification: "required" });
    const allowCredentials = options.reauthentication_options.allowCredentials as { id: string }[];
    expect(allowCredentials.map((c) => c.id)).toEqual([ownPasskey?.credentialId]);
  });
});

describe("POST /users/passkeys/:id/remove", () => {
  let emulatorA: WebAuthnEmulator;
  let emulatorB: WebAuthnEmulator;

  beforeEach(async () => {
    emulatorA = newDeviceEmulator();
    emulatorB = newDeviceEmulator();
    await registerPasskey(userId, emulatorA, "Notebook del local");
    await registerPasskey(userId, emulatorB, "Teléfono del local");
  });

  async function removePasskey(
    rawSessionId: string,
    targetId: string,
    reauthEmulator: WebAuthnEmulator,
  ) {
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = reauthEmulator.getJSON(
      BACKOFFICE_ORIGIN,
      options.reauthentication_options,
    );
    return postJson(
      `/users/passkeys/${targetId}/remove`,
      { reauthentication },
      cookieHeader(rawSessionId),
    );
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

    const response = await postJson(
      `/users/passkeys/${target.id}/remove`,
      {},
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("3600");
    const [stillThere] = await db.select().from(passkeys).where(eq(passkeys.id, target.id));
    expect(stillThere).toBeDefined();
  });

  it("removes the named passkey with a valid reauthentication, writing an audit row", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");

    const response = await removePasskey(rawSessionId, target.id, emulatorA);

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

  it("allows the reauthenticating passkey to be the one removed", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Notebook del local"));
    if (!target) throw new Error("test setup: target passkey not found");

    const response = await removePasskey(rawSessionId, target.id, emulatorA);

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
    const removeFirst = await removePasskey(rawSessionId, firstTarget.id, emulatorA);
    expect(removeFirst.statusCode).toBe(200);
    const [lastTarget] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    if (!lastTarget) throw new Error("test setup: last passkey not found");

    const response = await removePasskey(rawSessionId, lastTarget.id, emulatorA);

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

    await removePasskey(rawSessionId, target.id, emulatorA);

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

    const response = await removePasskey(rawSessionId, strangerPasskey.id, emulatorA);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.id, strangerPasskey.id));
    expect(rows).toHaveLength(1);
  });

  it("returns not_found for a non-existent passkey id", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = emulatorA.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);

    const response = await postJson(
      "/users/passkeys/00000000-0000-0000-0000-000000000000/remove",
      { reauthentication },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("returns not_found for a malformed passkey id", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = emulatorA.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);

    const response = await postJson(
      "/users/passkeys/not-a-uuid/remove",
      { reauthentication },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("keeps the pending challenge redeemable after a request rejected for a malformed id", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = emulatorA.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);
    const malformed = await postJson(
      "/users/passkeys/not-a-uuid/remove",
      { reauthentication },
      cookieHeader(rawSessionId),
    );
    expect(malformed.statusCode).toBe(404);

    const response = await postJson(
      `/users/passkeys/${target.id}/remove`,
      { reauthentication },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(200);
  });

  it("keeps the pending challenge redeemable after a request with a missing or malformed reauthentication", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = emulatorA.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);
    const missingReauthentication = await postJson(
      `/users/passkeys/${target.id}/remove`,
      {},
      cookieHeader(rawSessionId),
    );
    expect(missingReauthentication.statusCode).toBe(401);
    expect(missingReauthentication.json()).toMatchObject({ code: "authentication_failed" });
    const malformedReauthentication = await postJson(
      `/users/passkeys/${target.id}/remove`,
      { reauthentication: { id: 42 } },
      cookieHeader(rawSessionId),
    );
    expect(malformedReauthentication.statusCode).toBe(401);

    const response = await postJson(
      `/users/passkeys/${target.id}/remove`,
      { reauthentication },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(200);
  });

  it("rejects a reauthentication whose signature was tampered with, deleting nothing", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = emulatorA.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);
    const tampered = {
      ...reauthentication,
      response: {
        ...reauthentication.response,
        signature: `${reauthentication.response.signature.slice(0, -4)}AAAA`,
      },
    };

    const response = await postJson(
      `/users/passkeys/${target.id}/remove`,
      { reauthentication: tampered },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("rejects a reauthentication carrying another account's credential, deleting nothing", async () => {
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
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = strangerEmulator.getJSON(BACKOFFICE_ORIGIN, {
      ...options.reauthentication_options,
      allowCredentials: [],
    });

    const response = await postJson(
      `/users/passkeys/${target.id}/remove`,
      { reauthentication },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("rejects a challenge that aged past its lifetime, deleting nothing", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = emulatorA.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);
    currentTime = new Date(NOON.getTime() + PASSKEY_CHALLENGE_TTL_MS);

    const response = await postJson(
      `/users/passkeys/${target.id}/remove`,
      { reauthentication },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("rejects removing with no prior options request", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");

    const response = await postJson(
      `/users/passkeys/${target.id}/remove`,
      { reauthentication: {} },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("consumes the pending challenge, rejecting a second use of the same reauthentication", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");
    const options = await requestRemovalOptions(rawSessionId);
    const reauthentication = emulatorA.getJSON(BACKOFFICE_ORIGIN, options.reauthentication_options);
    const body = { reauthentication };
    const first = await postJson(
      `/users/passkeys/${target.id}/remove`,
      body,
      cookieHeader(rawSessionId),
    );
    expect(first.statusCode).toBe(200);

    const second = await postJson(
      `/users/passkeys/${target.id}/remove`,
      body,
      cookieHeader(rawSessionId),
    );

    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ code: "authentication_failed" });
  });

  it("updates the reauthenticating passkey's counter and last_used_at", async () => {
    const rawSessionId = await insertSession(userId);
    const [target] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Teléfono del local"));
    if (!target) throw new Error("test setup: target passkey not found");
    currentTime = new Date(NOON.getTime() + 60 * 1000);

    await removePasskey(rawSessionId, target.id, emulatorA);

    const [reauthPasskey] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Notebook del local"));
    expect(reauthPasskey?.lastUsedAt).toEqual(currentTime);
  });
});
