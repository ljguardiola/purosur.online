import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator from "nid-webauthn-emulator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, passkeys, recoveryTokens, sessions, users } from "../db/schema.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { registerSessionAuthenticateRoute } from "./session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "./session-authentication-options-route.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";
import { SIGN_IN_FAILURE_LIMIT } from "./sign-in-lockout.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const SOURCE_ADDRESS = "203.0.113.10";

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;
let app: FastifyInstance;
let recoveryApp: FastifyInstance;
let userId: string;
let currentTime: Date;
let delaySpy: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;

async function buildApp() {
  const built = Fastify();
  registerSessionAuthenticationOptionsRoute(built, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  registerSessionAuthenticateRoute(built, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
    delay: delaySpy,
  });
  return built;
}

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada Lovelace", email: "ada@example.com" })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("seeding the test user returned no row");
  }
  userId = user.id;

  currentTime = NOON;
  delaySpy = vi.fn(async (_ms: number) => {});
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
  await client.close();
});

function postOptions(headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/users/session/authentication-options",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS, ...headers },
  });
}

function postAuthenticate(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/users/session/authenticate",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS, ...headers },
    payload: body,
  });
}

let tokenSequence = 0;

/**
 * Issues a live recovery token for `forUserId` and requests fresh registration options for it,
 * both through the real `/users/recovery/*` HTTP routes so every WebAuthn options/response value
 * this test passes to `WebAuthnEmulator` crosses the same JSON boundary a real browser would,
 * instead of being typed directly against `@simplewebauthn/server`'s exports (which
 * `nid-webauthn-emulator`'s own bundled types don't structurally match one-for-one).
 */
async function requestRegistrationOptions(forUserId: string) {
  tokenSequence += 1;
  const rawToken = `raw-token-${tokenSequence}`;
  await db.insert(recoveryTokens).values({
    userId: forUserId,
    tokenHash: hashRecoveryToken(rawToken),
    issuedAt: currentTime,
    expiresAt: new Date(currentTime.getTime() + FIFTEEN_MINUTES_MS),
  });
  const response = await recoveryApp.inject({
    method: "POST",
    url: "/users/recovery/registration-options",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS },
    payload: { recovery_token: rawToken },
  });
  if (response.statusCode !== 200) {
    throw new Error(
      `test setup: registration-options failed: ${response.statusCode} ${response.body}`,
    );
  }
  return { rawToken, options: response.json().passkey_registration_options };
}

/** Registers a real passkey for `forUserId`, backed by `emulator`, via the actual redeem route. */
async function registerPasskey(forUserId: string, emulator: WebAuthnEmulator) {
  const { rawToken, options } = await requestRegistrationOptions(forUserId);
  const credential = emulator.createJSON(BACKOFFICE_ORIGIN, options);
  const response = await recoveryApp.inject({
    method: "POST",
    url: "/users/recovery/redeem",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS },
    payload: { recovery_token: rawToken, passkey_registration: credential },
  });
  if (response.statusCode !== 200) {
    throw new Error(`test setup: redeem failed: ${response.statusCode} ${response.body}`);
  }
}

async function getAuthenticationAssertion(emulator: WebAuthnEmulator) {
  const response = await postOptions();
  if (response.statusCode !== 200) {
    throw new Error(`authentication-options failed: ${response.statusCode} ${response.body}`);
  }
  const options = response.json().passkey_authentication_options;
  return emulator.getJSON(BACKOFFICE_ORIGIN, options);
}

describe("POST /users/session/authenticate", () => {
  it("signs the account in when the assertion verifies", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const assertion = await getAuthenticationAssertion(emulator);

    const response = await postAuthenticate({ assertion });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(String(setCookie)).toContain("HttpOnly");
    expect(String(setCookie)).toContain("Secure");
    expect(String(setCookie)).toContain("SameSite=Lax");
    expect(String(setCookie)).toContain("Path=/");

    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).toBeNull();
  });

  it("issues a brand-new session id and ends whatever session cookie arrived", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const firstAssertion = await getAuthenticationAssertion(emulator);
    const first = await postAuthenticate({ assertion: firstAssertion });
    const firstCookie = String(first.headers["set-cookie"]);
    const firstRawId = firstCookie.split(";")[0]?.split("=")[1];

    const secondAssertion = await getAuthenticationAssertion(emulator);
    const second = await postAuthenticate(
      { assertion: secondAssertion },
      { cookie: `${SESSION_COOKIE_NAME}=${firstRawId}` },
    );

    expect(second.statusCode).toBe(200);
    const secondCookie = String(second.headers["set-cookie"]);
    expect(secondCookie).not.toContain(`=${firstRawId};`);

    const [firstRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(String(firstRawId))));
    expect(firstRow?.revokedAt).not.toBeNull();
  });

  it("rejects an unknown credential as authentication_failed", async () => {
    const registeredEmulator = new WebAuthnEmulator();
    await registerPasskey(userId, registeredEmulator);
    // A distinct account whose registration this server never redeemed: its own emulator holds a
    // real, valid credential that the `passkeys` table simply has no row for.
    const [strangerUser] = await db
      .insert(users)
      .values({ firstName: "Grace Hopper", email: "grace@example.com" })
      .returning({ id: users.id });
    if (!strangerUser) {
      throw new Error("test setup: seeding the stranger user returned no row");
    }
    const unregisteredEmulator = new WebAuthnEmulator();
    const { options: registrationOptions } = await requestRegistrationOptions(strangerUser.id);
    unregisteredEmulator.createJSON(BACKOFFICE_ORIGIN, registrationOptions);
    const response = await postOptions();
    const authOptions = response.json().passkey_authentication_options;
    const assertion = unregisteredEmulator.getJSON(BACKOFFICE_ORIGIN, authOptions);

    const authResponse = await postAuthenticate({ assertion });

    expect(authResponse.statusCode).toBe(401);
    expect(authResponse.json()).toEqual({
      code: "authentication_failed",
      message: expect.any(String),
    });
  });

  it("rejects a tampered signature as authentication_failed, identically to an unknown credential", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const assertion = await getAuthenticationAssertion(emulator);
    const tampered = {
      ...assertion,
      response: {
        ...assertion.response,
        signature: `${assertion.response.signature.slice(0, -4)}AAAA`,
      },
    };

    const response = await postAuthenticate({ assertion: tampered });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "authentication_failed",
      message: expect.any(String),
    });
  });

  it("rejects a replayed assertion (its challenge already consumed) as authentication_failed", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const assertion = await getAuthenticationAssertion(emulator);
    await postAuthenticate({ assertion });

    const replay = await postAuthenticate({ assertion });

    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ code: "authentication_failed" });
  });

  it("rejects a missing assertion as authentication_failed", async () => {
    const response = await postAuthenticate({});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
  });

  it("pads a failure's response time up to the uniform floor", async () => {
    await postAuthenticate({});

    expect(delaySpy).toHaveBeenCalled();
  });

  it("does not pad a successful sign-in", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const assertion = await getAuthenticationAssertion(emulator);

    await postAuthenticate({ assertion });

    expect(delaySpy).not.toHaveBeenCalled();
  });

  it("rejects a signature counter that does not exceed the stored one once it left zero", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    // Bump the stored counter above the authenticator's own next value to force a clone signal.
    await db.update(passkeys).set({ counter: 1_000_000 }).where(eq(passkeys.userId, userId));
    const assertion = await getAuthenticationAssertion(emulator);

    const response = await postAuthenticate({ assertion });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authentication_failed" });
    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("rejects a missing Origin header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/users/session/authenticate",
      headers: { "x-real-ip": SOURCE_ADDRESS },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  describe("lockout", () => {
    it("blocks the 11th failed attempt from the same source address within an hour", async () => {
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
        const response = await postAuthenticate({});
        expect(response.statusCode).toBe(401);
      }

      const eleventh = await postAuthenticate({});

      expect(eleventh.statusCode).toBe(429);
      expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
      expect(eleventh.headers["retry-after"]).toBeDefined();
    });

    it("checks the lockout before ever looking up a credential, so a locked address cannot sign in even with a valid passkey", async () => {
      const emulator = new WebAuthnEmulator();
      await registerPasskey(userId, emulator);
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
        await postAuthenticate({});
      }
      const assertion = await getAuthenticationAssertion(emulator);

      const response = await postAuthenticate({ assertion });

      expect(response.statusCode).toBe(429);
      const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
      expect(rows).toHaveLength(0);
    });

    it("never blocks a different source address", async () => {
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
        await postAuthenticate({}, { "x-real-ip": "203.0.113.10" });
      }

      const response = await postAuthenticate({}, { "x-real-ip": "203.0.113.99" });

      expect(response.statusCode).toBe(401);
    });

    it("writes a backoffice_lockout audit row with no actor once the block is set", async () => {
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
        await postAuthenticate({});
      }

      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entity, "backoffice_lockout"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorId: null });
      expect(rows[0]?.newValue).toMatchObject({ failureCount: SIGN_IN_FAILURE_LIMIT });
    });
  });
});
