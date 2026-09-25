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
import { registerSessionAuthorizationRoutes } from "../session/session-authorization-route.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
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

/**
 * Mounts both routers a session's own account can hold two independent pending passkey
 * challenges through: registration (`registration-options` / `POST /users/passkeys`) and session
 * authorization (`authorization-options` / `POST /users/session/authorization`). One tab could ask
 * for either while the other is mid-ceremony, so these two routers share the same `passkey_challenges`
 * table and must not step on each other's pending row.
 */
async function buildApp() {
  const built = Fastify();
  registerPasskeyRegistrationRoutes(built, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
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

async function insertAuthorizedSession(forUserId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId: forUserId,
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

function postJson(url: string, body: Record<string, unknown>, rawSessionId: string) {
  return app.inject({
    method: "POST",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
    payload: body,
  });
}

async function requestRegistrationOptions(rawSessionId: string) {
  const response = await postJson("/users/passkeys/registration-options", {}, rawSessionId);
  if (response.statusCode !== 200) {
    throw new Error(
      `test setup: registration-options failed: ${response.statusCode} ${response.body}`,
    );
  }
  return response.json();
}

async function requestAuthorizationOptions(rawSessionId: string) {
  const response = await postJson("/users/session/authorization-options", {}, rawSessionId);
  if (response.statusCode !== 200) {
    throw new Error(
      `test setup: authorization-options failed: ${response.statusCode} ${response.body}`,
    );
  }
  return response.json();
}

describe("a session's registration and session-authorization challenges holding separate slots", () => {
  it("keeps a pending registration challenge intact through an in-between session authorization", async () => {
    const firstDevice = new WebAuthnEmulator();
    await registerFirstPasskey(userId, firstDevice);
    const rawSessionId = await insertAuthorizedSession(userId);
    const registrationOptions = await requestRegistrationOptions(rawSessionId);
    const secondDevice = newDeviceEmulator();
    const passkeyRegistration = secondDevice.createJSON(
      BACKOFFICE_ORIGIN,
      registrationOptions.passkey_registration_options,
    );

    const authorizationOptions = await requestAuthorizationOptions(rawSessionId);
    const authorization = firstDevice.getJSON(
      BACKOFFICE_ORIGIN,
      authorizationOptions.authorization_options,
    );
    const authorizeResponse = await postJson(
      "/users/session/authorization",
      { authorization },
      rawSessionId,
    );
    expect(authorizeResponse.statusCode).toBe(200);

    const registerResponse = await postJson(
      "/users/passkeys",
      { passkey_registration: passkeyRegistration, passkey_name: "Teléfono del local" },
      rawSessionId,
    );

    expect(registerResponse.statusCode).toBe(200);
  });

  it("keeps a pending session-authorization challenge intact through an in-between registration request", async () => {
    const emulator = new WebAuthnEmulator();
    await registerFirstPasskey(userId, emulator);
    const rawSessionId = await insertAuthorizedSession(userId);
    const authorizationOptions = await requestAuthorizationOptions(rawSessionId);
    const authorization = emulator.getJSON(
      BACKOFFICE_ORIGIN,
      authorizationOptions.authorization_options,
    );

    await requestRegistrationOptions(rawSessionId);

    const authorizeResponse = await postJson(
      "/users/session/authorization",
      { authorization },
      rawSessionId,
    );

    expect(authorizeResponse.statusCode).toBe(200);
  });
});
