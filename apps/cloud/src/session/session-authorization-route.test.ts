import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator, {
  AuthenticatorEmulator,
  PasskeysCredentialsMemoryRepository,
} from "nid-webauthn-emulator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { recoveryTokens, sessions, users } from "../db/schema.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerSessionAuthorizationRoutes } from "./session-authorization-route.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";

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
  registerSessionAuthorizationRoutes(built, {
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
    throw new Error("test setup: seeding the test user returned no row");
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

/** Registers a real first passkey for `forUserId`, backed by `emulator`, through the recovery redeem route. */
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

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
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

async function requestAuthorizationOptions(rawSessionId: string) {
  const response = await postJson(
    "/users/session/authorization-options",
    {},
    cookieHeader(rawSessionId),
  );
  if (response.statusCode !== 200) {
    throw new Error(
      `test setup: authorization-options failed: ${response.statusCode} ${response.body}`,
    );
  }
  return response.json();
}

describe("POST /users/session/authorization-options", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await postJson("/users/session/authorization-options", {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await app.inject({
      method: "POST",
      url: "/users/session/authorization-options",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns options allowing only the account's own passkeys", async () => {
    const emulator = newDeviceEmulator();
    await registerFirstPasskey(userId, emulator);
    const rawSessionId = await insertSession(userId);

    const options = await requestAuthorizationOptions(rawSessionId);

    expect(options.authorization_options).toMatchObject({ userVerification: "required" });
    const allowCredentials = options.authorization_options.allowCredentials as { id: string }[];
    expect(allowCredentials).toHaveLength(1);
  });
});

describe("POST /users/session/authorization", () => {
  let emulator: WebAuthnEmulator;

  beforeEach(async () => {
    emulator = newDeviceEmulator();
    await registerFirstPasskey(userId, emulator);
  });

  function authorize(
    rawSessionId: string | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    return postJson(
      "/users/session/authorization",
      body,
      rawSessionId ? { ...cookieHeader(rawSessionId), ...headers } : headers,
    );
  }

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await authorize(undefined, {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await app.inject({
      method: "POST",
      url: "/users/session/authorization",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("sets sessions.passkey_authorized_at on a valid authorization", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestAuthorizationOptions(rawSessionId);
    const authorization = emulator.getJSON(BACKOFFICE_ORIGIN, options.authorization_options);

    const response = await authorize(rawSessionId, { authorization });

    expect(response.statusCode).toBe(200);
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.passkeyAuthorizedAt).toEqual(currentTime);
  });

  it("rejects a missing authorization, setting nothing", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await authorize(rawSessionId, {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.passkeyAuthorizedAt).toBeNull();
  });

  it("rejects an authorization with no prior options request, setting nothing", async () => {
    const rawSessionId = await insertSession(userId);

    const response = await authorize(rawSessionId, {
      authorization: { id: "not-a-real-credential" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
  });

  it("never accepts a registration challenge to authorize the session", async () => {
    const rawSessionId = await insertSession(userId);
    const registrationApp = Fastify();
    const { registerPasskeyRegistrationRoutes } = await import(
      "../passkeys/passkeys-registration-route.js"
    );
    registerPasskeyRegistrationRoutes(registrationApp, {
      db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => currentTime,
    });
    const registrationOptionsResponse = await registrationApp.inject({
      method: "POST",
      url: "/users/passkeys/registration-options",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
    });
    expect(registrationOptionsResponse.statusCode).toBe(200);
    const authorization = emulator.getJSON(BACKOFFICE_ORIGIN, {
      ...registrationOptionsResponse.json().passkey_registration_options,
      allowCredentials: [],
    });
    await registrationApp.close();

    const response = await authorize(rawSessionId, { authorization });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
  });

  it("rejects a replayed authorization (consumes the challenge on first use)", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestAuthorizationOptions(rawSessionId);
    const authorization = emulator.getJSON(BACKOFFICE_ORIGIN, options.authorization_options);
    const body = { authorization };

    const first = await authorize(rawSessionId, body);
    expect(first.statusCode).toBe(200);

    const second = await authorize(rawSessionId, body);

    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ code: "authentication_failed" });
  });

  it("rejects an authorization whose signature was tampered with, setting nothing (proves the signature is actually verified)", async () => {
    const rawSessionId = await insertSession(userId);
    const options = await requestAuthorizationOptions(rawSessionId);
    const authorization = emulator.getJSON(BACKOFFICE_ORIGIN, options.authorization_options);
    const tampered = {
      ...authorization,
      response: {
        ...authorization.response,
        signature: `${authorization.response.signature.slice(0, -4)}AAAA`,
      },
    };

    const response = await authorize(rawSessionId, { authorization: tampered });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.passkeyAuthorizedAt).toBeNull();
  });

  it("rejects an authorization carrying another account's credential, setting nothing (proves the credential's owner is actually checked)", async () => {
    const [strangerUser] = await db
      .insert(users)
      .values({
        firstName: "Stranger",
        email: "stranger-account@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!strangerUser) throw new Error("test setup: seeding the stranger user returned no row");
    const strangerEmulator = newDeviceEmulator();
    await registerFirstPasskey(strangerUser.id, strangerEmulator);
    const rawSessionId = await insertSession(userId);
    const options = await requestAuthorizationOptions(rawSessionId);
    const authorization = strangerEmulator.getJSON(BACKOFFICE_ORIGIN, {
      ...options.authorization_options,
      allowCredentials: [],
    });

    const response = await authorize(rawSessionId, { authorization });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.passkeyAuthorizedAt).toBeNull();
  });
});
