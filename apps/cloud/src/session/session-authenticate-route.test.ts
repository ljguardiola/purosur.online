import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator from "nid-webauthn-emulator";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  passkeys,
  recoveryTokens,
  sessions,
  signInChallenges,
  signInLockouts,
  users,
} from "../db/schema.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerSessionAuthenticateRoute } from "./session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "./session-authentication-options-route.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";
import { SIGN_IN_FAILURE_LIMIT } from "./sign-in-lockout.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const SOURCE_ADDRESS = "203.0.113.10";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let client: TestDatabase["client"];
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

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  client = testDatabase.client;
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
    payload: {
      recovery_token: rawToken,
      passkey_registration: credential,
      passkey_name: "Notebook del local",
    },
  });
  if (response.statusCode !== 200) {
    throw new Error(`test setup: redeem failed: ${response.statusCode} ${response.body}`);
  }
}

/**
 * An assertion the server can read and takes all the way to the credential check, and rejects
 * there because no passkey was ever registered under that credential id — a genuine rejected
 * sign-in attempt, without an authenticator's key material behind it.
 */
function rejectedAssertion() {
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: "a-challenge-this-server-never-issued",
      origin: BACKOFFICE_ORIGIN,
    }),
  ).toString("base64url");
  return { id: "an-unregistered-credential-id", response: { clientDataJSON } };
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

  it("stamps the used passkey's last_used_at with the injected clock", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const assertion = await getAuthenticationAssertion(emulator);
    currentTime = new Date(NOON.getTime() + 60 * 1000);

    const response = await postAuthenticate({ assertion });

    expect(response.statusCode).toBe(200);
    const [passkey] = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(passkey?.lastUsedAt).toEqual(currentTime);
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

  it("leaves the incoming session alone and opens none of its own when the sign-in cannot be stored", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const first = await postAuthenticate({ assertion: await getAuthenticationAssertion(emulator) });
    const firstRawId = String(first.headers["set-cookie"]).split(";")[0]?.split("=")[1];
    // The database is shared across this file's tests: the injected schema break is undone however
    // this test ends, or every later test's session insert would fail against it.
    onTestFinished(async () => {
      await client.exec("alter table sessions drop column if exists injected_failure");
    });
    // A column with no default fails exactly the INSERT of the new session, while the revoke of
    // the incoming one — an UPDATE of a row already stored — still goes through on its own.
    await client.exec(
      "alter table sessions add column injected_failure text not null default 'x';" +
        "alter table sessions alter column injected_failure drop default;",
    );

    const response = await postAuthenticate(
      { assertion: await getAuthenticationAssertion(emulator) },
      { cookie: `${SESSION_COOKIE_NAME}=${firstRawId}` },
    );

    expect(response.statusCode).toBe(500);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionIdHash).toBe(hashSessionId(String(firstRawId)));
    expect(rows[0]?.revokedAt).toBeNull();
  });

  it("rejects an unknown credential as authentication_failed", async () => {
    const registeredEmulator = new WebAuthnEmulator();
    await registerPasskey(userId, registeredEmulator);
    // A distinct account whose registration this server never redeemed: its own emulator holds a
    // real, valid credential that the `passkeys` table simply has no row for.
    const [strangerUser] = await db
      .insert(users)
      .values({
        firstName: "Grace Hopper",
        email: "grace@example.com",
        locationId: await seededLocationId(db),
      })
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

  it("consumes the challenge of an attempt whose credential id is unknown, leaving nothing to retry with", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const assertion = await getAuthenticationAssertion(emulator);
    const probe = { ...assertion, id: "an-unregistered-credential-id" };
    expect(await db.select().from(signInChallenges)).toHaveLength(1);

    const response = await postAuthenticate({ assertion: probe });

    expect(response.statusCode).toBe(401);
    expect(await db.select().from(signInChallenges)).toHaveLength(0);
  });

  it("consumes the challenge of a deactivated account's attempt", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    await db.update(users).set({ active: false }).where(eq(users.id, userId));
    const assertion = await getAuthenticationAssertion(emulator);
    expect(await db.select().from(signInChallenges)).toHaveLength(1);

    const response = await postAuthenticate({ assertion });

    expect(response.statusCode).toBe(401);
    expect(await db.select().from(signInChallenges)).toHaveLength(0);
  });

  it("rejects a deactivated account's passkey as authentication_failed, identically to an unknown credential, and opens no session", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    await db.update(users).set({ active: false }).where(eq(users.id, userId));
    const assertion = await getAuthenticationAssertion(emulator);

    const response = await postAuthenticate({ assertion });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "authentication_failed",
      message: expect.any(String),
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("counts a deactivated account's rejected attempt toward the per-source lockout", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    await db.update(users).set({ active: false }).where(eq(users.id, userId));

    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
      const assertion = await getAuthenticationAssertion(emulator);
      const response = await postAuthenticate({ assertion });
      expect(response.statusCode).toBe(401);
    }

    const assertion = await getAuthenticationAssertion(emulator);
    const eleventh = await postAuthenticate({ assertion });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
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
        const response = await postAuthenticate({ assertion: rejectedAssertion() });
        expect(response.statusCode).toBe(401);
      }

      const eleventh = await postAuthenticate({ assertion: rejectedAssertion() });

      expect(eleventh.statusCode).toBe(429);
      expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
      expect(eleventh.headers["retry-after"]).toBeDefined();
    });

    it("checks the lockout before ever looking up a credential, so a locked address cannot sign in even with a valid passkey", async () => {
      const emulator = new WebAuthnEmulator();
      await registerPasskey(userId, emulator);
      for (let i = 0; i <= SIGN_IN_FAILURE_LIMIT; i++) {
        await postAuthenticate({ assertion: rejectedAssertion() });
      }
      const assertion = await getAuthenticationAssertion(emulator);

      const response = await postAuthenticate({ assertion });

      expect(response.statusCode).toBe(429);
      const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
      expect(rows).toHaveLength(0);
    });

    it("never blocks a different source address", async () => {
      for (let i = 0; i <= SIGN_IN_FAILURE_LIMIT; i++) {
        await postAuthenticate({ assertion: rejectedAssertion() }, { "x-real-ip": "203.0.113.10" });
      }

      const response = await postAuthenticate(
        { assertion: rejectedAssertion() },
        { "x-real-ip": "203.0.113.99" },
      );

      expect(response.statusCode).toBe(401);
    });

    it("does not count a request carrying no assertion at all, so empty requests cannot burn an address's budget", async () => {
      for (let i = 0; i <= SIGN_IN_FAILURE_LIMIT; i++) {
        const response = await postAuthenticate({});
        expect(response.statusCode).toBe(401);
      }

      const next = await postAuthenticate({});

      expect(next.statusCode).toBe(401);
    });

    it("blocks the address on the tenth rejected attempt, not on the request after it", async () => {
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
        const response = await postAuthenticate({ assertion: rejectedAssertion() });
        expect(response.statusCode).toBe(401);
      }

      expect(await db.select().from(signInLockouts)).toHaveLength(1);
      const audited = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entity, "backoffice_lockout"));
      expect(audited).toHaveLength(1);
      expect(audited[0]?.newValue).toMatchObject({ failureCount: SIGN_IN_FAILURE_LIMIT });
    });

    it("does not count a sign-in that succeeded", async () => {
      const emulator = new WebAuthnEmulator();
      await registerPasskey(userId, emulator);
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT - 1; i++) {
        await postAuthenticate({ assertion: rejectedAssertion() });
      }
      const signedIn = await postAuthenticate({
        assertion: await getAuthenticationAssertion(emulator),
      });
      expect(signedIn.statusCode).toBe(200);

      const response = await postAuthenticate({ assertion: rejectedAssertion() });

      expect(response.statusCode).toBe(401);
    });

    it("still answers the uniform rejection, on the same timing floor, when the bookkeeping fails", async () => {
      const reportError = vi.fn();
      const failing = Fastify();
      registerSessionAuthenticateRoute(failing, {
        db,
        backofficeOrigin: BACKOFFICE_ORIGIN,
        now: () => currentTime,
        delay: delaySpy,
        confirmRejectedSignInAttempt: () => Promise.reject(new Error("the database went away")),
        reportError,
      });

      const response = await failing.inject({
        method: "POST",
        url: "/users/session/authenticate",
        headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS },
        payload: { assertion: rejectedAssertion() },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authentication_failed" });
      expect(delaySpy).toHaveBeenCalled();
      expect(reportError).toHaveBeenCalled();
      await failing.close();
    });

    it("writes one backoffice_lockout audit row with no actor per block, however many attempts follow it", async () => {
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT + 3; i++) {
        await postAuthenticate({ assertion: rejectedAssertion() });
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
