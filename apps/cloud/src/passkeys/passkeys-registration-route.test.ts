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
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
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
    .values({ firstName: "Ada Lovelace", email: "ada@example.com" })
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

/**
 * A `WebAuthnEmulator` backed by its own isolated credential store, standing in for a genuinely
 * different physical authenticator. `nid-webauthn-emulator`'s default constructor shares one
 * static in-memory repository across every instance that doesn't override it, so two `new
 * WebAuthnEmulator()` calls would otherwise see each other's credentials and reject `excludeCredentials`
 * on a device that never actually held that credential.
 */
function newDeviceEmulator(): WebAuthnEmulator {
  return new WebAuthnEmulator(
    new AuthenticatorEmulator({ credentialsRepository: new PasskeysCredentialsMemoryRepository() }),
  );
}

/**
 * Registers a real first passkey for `forUserId`, backed by `emulator`, through the actual
 * recovery redeem route — the same way `session-authenticate-route.test.ts` seeds a genuine
 * credential, so every WebAuthn value this test hands to the passkey routes crossed the same JSON
 * boundary a real browser would.
 */
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
 * Returned untyped (matching `session-authenticate-route.test.ts`'s own `requestRegistrationOptions`):
 * `nid-webauthn-emulator`'s own bundled WebAuthn JSON types don't structurally match
 * `@simplewebauthn/server`'s exports one-for-one, so this crosses the same JSON boundary a real
 * browser would instead of being typed directly against either package's types.
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

  it("returns reauthentication options allowing only the account's own passkeys", async () => {
    const emulator = new WebAuthnEmulator();
    await registerFirstPasskey(userId, emulator);
    const rawSessionId = await insertSession(userId);
    const [ownPasskey] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));

    const options = await requestOptions(rawSessionId);

    expect(options.reauthentication_options).toMatchObject({ userVerification: "required" });
    const allowCredentials = options.reauthentication_options.allowCredentials as { id: string }[];
    expect(allowCredentials.map((c) => c.id)).toEqual([ownPasskey?.credentialId]);
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
      kind: "removal",
      reauthenticationChallenge: "stale-challenge",
      createdAt: new Date(NOON.getTime() - PASSKEY_CHALLENGE_TTL_MS),
    });
    const rawSessionId = await insertSession(userId);

    const options = await requestOptions(rawSessionId);

    const rows = await db.select().from(passkeyChallenges);
    expect(rows.map((row) => row.reauthenticationChallenge)).toEqual([
      options.reauthentication_options.challenge,
    ]);
  });

  it("rejects an account with no passkey to reauthenticate with, storing no challenge", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await postJson(
      "/users/passkeys/registration-options",
      {},
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    await expect(db.select().from(passkeyChallenges)).resolves.toEqual([]);
  });

  it("replaces a previously pending challenge with a fresh one", async () => {
    const emulator = new WebAuthnEmulator();
    await registerFirstPasskey(userId, emulator);
    const rawSessionId = await insertSession(userId);

    const first = await requestOptions(rawSessionId);
    const second = await requestOptions(rawSessionId);

    expect(first.reauthentication_options.challenge).not.toBe(
      second.reauthentication_options.challenge,
    );
    const rows = await db.select().from(passkeyChallenges);
    expect(rows).toHaveLength(1);
  });
});

describe("POST /users/passkeys", () => {
  async function registerSecondPasskey(rawSessionId: string, name = "Teléfono del local") {
    const options = await requestOptions(rawSessionId);
    const reauthEmulator = registeredEmulator;
    const reauthentication = reauthEmulator.getJSON(
      BACKOFFICE_ORIGIN,
      options.reauthentication_options,
    );
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );
    const response = await postJson(
      "/users/passkeys",
      { reauthentication, passkey_registration: passkeyRegistration, passkey_name: name },
      cookieHeader(rawSessionId),
    );
    return { response, newEmulator };
  }

  let registeredEmulator: WebAuthnEmulator;

  beforeEach(async () => {
    registeredEmulator = new WebAuthnEmulator();
    await registerFirstPasskey(userId, registeredEmulator);
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

  it("registers a second passkey with a valid reauthentication, writing an audit row", async () => {
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

  it("updates the reauthenticating passkey's counter and last_used_at", async () => {
    const rawSessionId = await insertSession(userId);
    currentTime = new Date(NOON.getTime() + 60 * 1000);

    await registerSecondPasskey(rawSessionId);

    const [reauthPasskey] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.name, "Notebook del local"));
    expect(reauthPasskey?.lastUsedAt).toEqual(currentTime);
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

  it("consumes the pending challenge, rejecting a second use of the same reauthentication and registration", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    const reauthentication = registeredEmulator.getJSON(
      BACKOFFICE_ORIGIN,
      options.reauthentication_options,
    );
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );
    const body = {
      reauthentication,
      passkey_registration: passkeyRegistration,
      passkey_name: "Teléfono del local",
    };
    const first = await postJson("/users/passkeys", body, cookieHeader(rawSessionId));
    expect(first.statusCode).toBe(200);

    const second = await postJson("/users/passkeys", body, cookieHeader(rawSessionId));

    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("rejects a challenge that aged past its lifetime, storing nothing", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    const reauthentication = registeredEmulator.getJSON(
      BACKOFFICE_ORIGIN,
      options.reauthentication_options,
    );
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );
    currentTime = new Date(NOON.getTime() + PASSKEY_CHALLENGE_TTL_MS);

    const response = await postJson(
      "/users/passkeys",
      { reauthentication, passkey_registration: passkeyRegistration, passkey_name: "Teléfono" },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("rejects registering with no prior options request, storing nothing", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await postJson(
      "/users/passkeys",
      { reauthentication: {}, passkey_registration: {}, passkey_name: "Teléfono" },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("rejects a reauthentication whose signature was tampered with, storing nothing", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    const reauthentication = registeredEmulator.getJSON(
      BACKOFFICE_ORIGIN,
      options.reauthentication_options,
    );
    const tampered = {
      ...reauthentication,
      response: {
        ...reauthentication.response,
        signature: `${reauthentication.response.signature.slice(0, -4)}AAAA`,
      },
    };
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );

    const response = await postJson(
      "/users/passkeys",
      { reauthentication: tampered, passkey_registration: passkeyRegistration, passkey_name: "X" },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("rejects a reauthentication carrying another account's credential, storing nothing", async () => {
    const [strangerUser] = await db
      .insert(users)
      .values({ firstName: "Grace Hopper", email: "grace@example.com" })
      .returning({ id: users.id });
    if (!strangerUser) {
      throw new Error("test setup: seeding the stranger user returned no row");
    }
    const strangerEmulator = newDeviceEmulator();
    await registerFirstPasskey(strangerUser.id, strangerEmulator);
    const rawSessionId = await insertSession(userId);
    const options = await requestOptions(rawSessionId);
    // The stranger's own authenticator presents its own resident credential once allowCredentials
    // stops filtering it out; the assertion is genuine and well-signed, just for a credential this
    // account never registered.
    const reauthentication = strangerEmulator.getJSON(BACKOFFICE_ORIGIN, {
      ...options.reauthentication_options,
      allowCredentials: [],
    });
    const newEmulator = newDeviceEmulator();
    const passkeyRegistration = newEmulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.passkey_registration_options,
    );

    const response = await postJson(
      "/users/passkeys",
      { reauthentication, passkey_registration: passkeyRegistration, passkey_name: "X" },
      cookieHeader(rawSessionId),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(rows).toHaveLength(1);
  });

  describe("passkey_name validation", () => {
    it.each([undefined, "", "   "])(
      "rejects passkey_name %j as validation_failed",
      async (name) => {
        const rawSessionId = await insertSession(userId);
        const options = await requestOptions(rawSessionId);
        const reauthentication = registeredEmulator.getJSON(
          BACKOFFICE_ORIGIN,
          options.reauthentication_options,
        );
        const newEmulator = newDeviceEmulator();
        const passkeyRegistration = newEmulator.createJSON(
          BACKOFFICE_ORIGIN,
          options.passkey_registration_options,
        );

        const response = await postJson(
          "/users/passkeys",
          {
            reauthentication,
            passkey_registration: passkeyRegistration,
            ...(name === undefined ? {} : { passkey_name: name }),
          },
          cookieHeader(rawSessionId),
        );

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: "validation_failed" });
        const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
        expect(rows).toHaveLength(1);
      },
    );

    it("keeps the pending challenge redeemable after a request rejected for its body", async () => {
      const rawSessionId = await insertSession(userId);
      const options = await requestOptions(rawSessionId);
      const reauthentication = registeredEmulator.getJSON(
        BACKOFFICE_ORIGIN,
        options.reauthentication_options,
      );
      const newEmulator = newDeviceEmulator();
      const passkeyRegistration = newEmulator.createJSON(
        BACKOFFICE_ORIGIN,
        options.passkey_registration_options,
      );
      const missingRegistration = await postJson(
        "/users/passkeys",
        { reauthentication, passkey_name: "Teléfono del local" },
        cookieHeader(rawSessionId),
      );
      expect(missingRegistration.statusCode).toBe(400);
      const blankName = await postJson(
        "/users/passkeys",
        { reauthentication, passkey_registration: passkeyRegistration, passkey_name: " " },
        cookieHeader(rawSessionId),
      );
      expect(blankName.statusCode).toBe(400);

      const response = await postJson(
        "/users/passkeys",
        {
          reauthentication,
          passkey_registration: passkeyRegistration,
          passkey_name: "Teléfono del local",
        },
        cookieHeader(rawSessionId),
      );

      expect(response.statusCode).toBe(200);
    });

    it("rejects a passkey_name over 40 characters once trimmed", async () => {
      const rawSessionId = await insertSession(userId);
      const { response } = await registerSecondPasskey(rawSessionId, `  ${"a".repeat(41)}  `);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation_failed" });
    });

    it("accepts and trims a passkey_name at exactly 40 characters once trimmed", async () => {
      const rawSessionId = await insertSession(userId);
      const { response } = await registerSecondPasskey(rawSessionId, `  ${"a".repeat(40)}  `);

      expect(response.statusCode).toBe(200);
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      const newRow = rows.find((row) => row.name === "a".repeat(40));
      expect(newRow).toBeDefined();
    });
  });
});
