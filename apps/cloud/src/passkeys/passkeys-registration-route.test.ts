import { and, eq, isNull } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator, {
  AuthenticatorEmulator,
  PasskeysCredentialsMemoryRepository,
} from "nid-webauthn-emulator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  alerts,
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
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "../session/passkey-authorization-guard.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { PASSKEY_CHALLENGE_TTL_MS } from "./passkey-challenge.js";
import { registerPasskeyRegistrationRoutes } from "./passkeys-registration-route.js";

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
  registerPasskeyRegistrationRoutes(built, {
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

function newDeviceEmulator(): WebAuthnEmulator {
  return new WebAuthnEmulator(
    new AuthenticatorEmulator({ credentialsRepository: new PasskeysCredentialsMemoryRepository() }),
  );
}

let tokenSequence = 0;

/** Registers a real first passkey for `forUserId`, backed by `emulator`, through the recovery route. */
async function registerFirstPasskey(forUserId: string, emulator: WebAuthnEmulator): Promise<void> {
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
    payload: {
      recovery_token: rawToken,
      passkey_registration: credential,
      passkey_name: "Notebook del local",
    },
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

/**
 * Returned untyped: `nid-webauthn-emulator`'s own bundled WebAuthn JSON types don't structurally
 * match `@simplewebauthn/server`'s exports one-for-one, so this crosses the same JSON boundary a
 * real browser would instead of being typed directly against either package's types.
 */
async function requestOptions(rawSessionId: string) {
  const response = await postJson(
    "/users/passkeys/registration-options",
    {},
    cookieHeader(rawSessionId),
  );
  if (response.statusCode !== 200) {
    throw new Error(
      `test setup: registration-options failed: ${response.statusCode} ${response.body}`,
    );
  }
  return response.json();
}

describe("POST /users/passkeys/registration-options", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await postJson("/users/passkeys/registration-options", {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await app.inject({
      method: "POST",
      url: "/users/passkeys/registration-options",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 429 rate_limited with Retry-After once the session is over its backoffice request limit, storing no challenge", async () => {
    const rawSessionId = await insertSession(userId);
    await exhaustSessionRateLimit(db, rawSessionId, currentTime);

    const response = await postJson(
      "/users/passkeys/registration-options",
      {},
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("3600");
    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    const challenges = session
      ? await db.select().from(passkeyChallenges).where(eq(passkeyChallenges.sessionId, session.id))
      : [];
    expect(challenges).toHaveLength(0);
  });

  it("returns 401 authorization_required and stores no challenge when the session was never authorized", async () => {
    const rawSessionId = await insertSession(userId, null);

    const response = await postJson(
      "/users/passkeys/registration-options",
      {},
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(passkeyChallenges)).toHaveLength(0);
  });

  it("returns 401 authorization_required and stores no challenge one second past the 5-minute boundary", async () => {
    const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
    const rawSessionId = await insertSession(userId, authorizedAt);

    const response = await postJson(
      "/users/passkeys/registration-options",
      {},
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(passkeyChallenges)).toHaveLength(0);
  });

  it("returns registration options and stores their challenge while the session's authorization is valid", async () => {
    const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS);
    const rawSessionId = await insertSession(userId, authorizedAt);

    const options = await requestOptions(rawSessionId);

    const rows = await db.select().from(passkeyChallenges);
    expect(rows.map((row) => row.registrationChallenge)).toEqual([
      options.passkey_registration_options.challenge,
    ]);
  });

  it("returns registration options excluding the account's existing passkeys", async () => {
    const emulator = new WebAuthnEmulator();
    await registerFirstPasskey(userId, emulator);
    const rawSessionId = await insertSession(userId);
    const [ownPasskey] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));

    const options = await requestOptions(rawSessionId);

    const excludeCredentials = options.passkey_registration_options.excludeCredentials as {
      id: string;
    }[];
    expect(excludeCredentials.map((c) => c.id)).toEqual([ownPasskey?.credentialId]);
  });

  it("prunes other sessions' passkey challenges that aged past their lifetime", async () => {
    const emulator = newDeviceEmulator();
    await registerFirstPasskey(userId, emulator);
    const staleSessionId = await insertSession(userId);
    const [staleSession] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(staleSessionId)));
    if (!staleSession) throw new Error("test setup: stale session not found");
    await db.insert(passkeyChallenges).values({
      sessionId: staleSession.id,
      kind: "registration",
      registrationChallenge: "stale-challenge",
      createdAt: new Date(NOON.getTime() - PASSKEY_CHALLENGE_TTL_MS),
    });
    const rawSessionId = await insertSession(userId);

    const options = await requestOptions(rawSessionId);

    const rows = await db.select().from(passkeyChallenges);
    expect(rows.map((row) => row.registrationChallenge)).toEqual([
      options.passkey_registration_options.challenge,
    ]);
  });

  it("replaces a previously pending challenge with a fresh one", async () => {
    const rawSessionId = await insertSession(userId);

    const first = await requestOptions(rawSessionId);
    const second = await requestOptions(rawSessionId);

    expect(first.passkey_registration_options.challenge).not.toBe(
      second.passkey_registration_options.challenge,
    );
    const rows = await db.select().from(passkeyChallenges);
    expect(rows).toHaveLength(1);
  });
});

describe("POST /users/passkeys", () => {
  async function registerSecondPasskey(rawSessionId: string, name = "Teléfono del local") {
    const options = await requestOptions(rawSessionId);
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );
    const response = await postJson(
      "/users/passkeys",
      { passkey_registration: passkeyRegistration, passkey_name: name },
      cookieHeader(rawSessionId),
    );
    return { response, newEmulator };
  }

  beforeEach(async () => {
    await registerFirstPasskey(userId, new WebAuthnEmulator());

    // Redeeming the setup passkey above already opened the account's own backoffice_passkey_changed
    // alert; closing it here keeps each test's own assertions about that alert free of this setup's
    // side effect.
    await db
      .update(alerts)
      .set({ resolvedAt: currentTime, resolvedBy: userId })
      .where(eq(alerts.scope, userId));
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await postJson("/users/passkeys", {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await app.inject({
      method: "POST",
      url: "/users/passkeys",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 429 rate_limited with Retry-After once the session is over its backoffice request limit, registering nothing", async () => {
    const rawSessionId = await insertSession(userId);
    const beforeCount = (await db.select().from(passkeys)).length;
    await exhaustSessionRateLimit(db, rawSessionId, currentTime);

    const response = await postJson("/users/passkeys", {}, cookieHeader(rawSessionId));

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("3600");
    expect((await db.select().from(passkeys)).length).toBe(beforeCount);
  });

  it("registers a second passkey with a valid registration, writing an audit row", async () => {
    const rawSessionId = await insertSession(userId);

    const { response } = await registerSecondPasskey(rawSessionId);

    expect(response.statusCode).toBe(200);
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
    const newRow = rows.find((row) => row.name === "Teléfono del local");
    expect(newRow).toBeDefined();

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "passkey"));
    const registrationAudit = audited.find(
      (row) => (row.newValue as { id?: string } | null)?.id === newRow?.id,
    );
    expect(registrationAudit).toMatchObject({
      actorId: userId,
      previousValue: null,
      newValue: { id: newRow?.id, name: "Teléfono del local" },
    });
  });

  it("opens a backoffice_passkey_changed alert scoped to the account", async () => {
    const rawSessionId = await insertSession(userId);

    const { response } = await registerSecondPasskey(rawSessionId);

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
        action: "registered",
        passkeyName: "Teléfono del local",
        actorId: userId,
        via: "self",
      },
    });
  });

  it("opens no alert when the registration is rejected as already registered, so nothing commits", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );
    await db.insert(passkeys).values({
      userId,
      credentialId: passkeyRegistration.id,
      publicKey: "unused-in-this-test",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Existing passkey",
    });

    const response = await postJson(
      "/users/passkeys",
      { passkey_registration: passkeyRegistration, passkey_name: "Teléfono del local" },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(400);
    const opened = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.kind, "backoffice_passkey_changed"), isNull(alerts.resolvedAt)));
    expect(opened).toHaveLength(0);
  });

  it("does not revoke the session on a successful registration", async () => {
    const rawSessionId = await insertSession(userId);

    await registerSecondPasskey(rawSessionId);

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.revokedAt).toBeNull();
  });

  it("consumes the pending challenge, rejecting a second use of the same registration", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );
    const body = { passkey_registration: passkeyRegistration, passkey_name: "Teléfono del local" };
    const first = await postJson("/users/passkeys", body, cookieHeader(rawSessionId));
    expect(first.statusCode).toBe(200);

    const second = await postJson("/users/passkeys", body, cookieHeader(rawSessionId));

    expect(second.statusCode).toBe(400);
    expect(second.json()).toMatchObject({ code: "validation_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("rejects a credential that is already registered as passkey_already_registered, storing nothing new", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );
    // A row for this exact credential id already exists, as if another request had already
    // registered it (or the device replayed a creation it made before, ignoring excludeCredentials).
    await db.insert(passkeys).values({
      userId,
      credentialId: passkeyRegistration.id,
      publicKey: "unused-in-this-test",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Existing passkey",
    });

    const response = await postJson(
      "/users/passkeys",
      { passkey_registration: passkeyRegistration, passkey_name: "Teléfono del local" },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "passkey_already_registered" });
    // The account's first passkey (seeded in beforeEach) plus the one row this test inserted by
    // hand: the rejected attempt stores nothing of its own.
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("rejects a challenge that aged past its lifetime, storing nothing", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );
    currentTime = new Date(NOON.getTime() + PASSKEY_CHALLENGE_TTL_MS);

    const response = await postJson(
      "/users/passkeys",
      { passkey_registration: passkeyRegistration, passkey_name: "Teléfono" },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("rejects registering with no prior options request, storing nothing", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await postJson(
      "/users/passkeys",
      { passkey_registration: {}, passkey_name: "Teléfono" },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(1);
  });

  describe("passkey_name validation", () => {
    it("rejects a missing passkey_name as validation_failed", async () => {
      const rawSessionId = await insertSession(userId);
      const options = await requestOptions(rawSessionId);
      const newEmulator = newDeviceEmulator();
      const passkeyRegistration = newEmulator.createJSON(
        BACKOFFICE_ORIGIN,
        options.passkey_registration_options,
      );

      const response = await postJson(
        "/users/passkeys",
        { passkey_registration: passkeyRegistration },
        cookieHeader(rawSessionId),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation_failed" });
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      expect(rows).toHaveLength(1);
    });

    it("trims a passkey_name and stores the trimmed value", async () => {
      const rawSessionId = await insertSession(userId);
      const { response } = await registerSecondPasskey(rawSessionId, "  Teléfono del local  ");

      expect(response.statusCode).toBe(200);
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      const newRow = rows.find((row) => row.name === "Teléfono del local");
      expect(newRow).toBeDefined();
    });
  });

  it("never registers a passkey on another account, even when the request body names one: the route reads no target id, so a passkey always lands on the session's own account", async () => {
    const [otherUser] = await db
      .insert(users)
      .values({
        firstName: "Grace Hopper",
        email: "grace@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!otherUser) throw new Error("test setup: seeding the other user returned no row");
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );

    const response = await postJson(
      "/users/passkeys",
      {
        passkey_registration: passkeyRegistration,
        passkey_name: "Passkey ajena",
        user_id: otherUser.id,
        id: otherUser.id,
        target_id: otherUser.id,
      },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(200);
    const otherUserPasskeys = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, otherUser.id));
    expect(otherUserPasskeys).toHaveLength(0);
    const ownPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(ownPasskeys.map((row) => row.name)).toContain("Passkey ajena");
  });

  describe("registration surviving the authorization window lapsing after registration-options", () => {
    it("registers the passkey even though the session's authorization was cleared after the options request", async () => {
      const rawSessionId = await insertSession(userId);
      const options = await requestOptions(rawSessionId);
      const newEmulator = newDeviceEmulator();
      const passkeyRegistration = newEmulator.createJSON(
        BACKOFFICE_ORIGIN,
        options.passkey_registration_options,
      );
      await db
        .update(sessions)
        .set({ passkeyAuthorizedAt: null })
        .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));

      const response = await postJson(
        "/users/passkeys",
        { passkey_registration: passkeyRegistration, passkey_name: "Teléfono del local" },
        cookieHeader(rawSessionId),
      );

      expect(response.statusCode).toBe(200);
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      expect(rows).toHaveLength(2);
    });

    it("registers the passkey and writes an audit row when the window lapses between registration-options (issued at 4:59) and the mutation (attempted at 5:30)", async () => {
      const authorizedAt = new Date(NOON.getTime() - (4 * 60 * 1000 + 59 * 1000));
      const rawSessionId = await insertSession(userId, authorizedAt);
      currentTime = new Date(authorizedAt.getTime() + (4 * 60 * 1000 + 59 * 1000));
      const options = await requestOptions(rawSessionId);
      const newEmulator = newDeviceEmulator();
      const passkeyRegistration = newEmulator.createJSON(
        BACKOFFICE_ORIGIN,
        options.passkey_registration_options,
      );
      currentTime = new Date(authorizedAt.getTime() + (5 * 60 * 1000 + 30 * 1000));

      const response = await postJson(
        "/users/passkeys",
        { passkey_registration: passkeyRegistration, passkey_name: "Teléfono del local" },
        cookieHeader(rawSessionId),
      );

      expect(response.statusCode).toBe(200);
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      const newRow = rows.find((row) => row.name === "Teléfono del local");
      expect(newRow).toBeDefined();
      const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "passkey"));
      expect(
        audited.some((row) => (row.newValue as { id?: string } | null)?.id === newRow?.id),
      ).toBe(true);
    });

    it("never completes a registration using a challenge pending under the session_authorization kind, even one carrying a registration challenge value", async () => {
      const rawSessionId = await insertSession(userId);
      const options = await requestOptions(rawSessionId);
      const newEmulator = newDeviceEmulator();
      const passkeyRegistration = newEmulator.createJSON(
        BACKOFFICE_ORIGIN,
        options.passkey_registration_options,
      );
      // Only the kind separates this row from a genuine pending registration: its registration
      // challenge is exactly the one the credential above was created against.
      await db.update(passkeyChallenges).set({ kind: "session_authorization" });

      const response = await postJson(
        "/users/passkeys",
        { passkey_registration: passkeyRegistration, passkey_name: "Teléfono del local" },
        cookieHeader(rawSessionId),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation_failed" });
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      expect(rows).toHaveLength(1);
    });
  });
});
