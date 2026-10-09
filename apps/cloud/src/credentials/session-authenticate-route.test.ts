import {
  RECOVERY_TOKEN_LIFETIME_MS,
  SIGN_IN_BLOCK_DURATION_MS,
  SIGN_IN_FAILURE_LIMIT,
} from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { WebAuthnEmulator } from "nid-webauthn-emulator";
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
import {
  auditLog,
  passkeys,
  recoveryTokens,
  sessions,
  signInChallenges,
  signInLockouts,
  users,
} from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { hashSessionId } from "../sessions/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRecoveryRedemptionRoutes } from "./recovery-redemption-route.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { registerSessionAuthenticateRoute } from "./session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "./session-authentication-options-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
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
    url: "/authentication-challenges",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS, ...headers },
  });
}

function postAuthenticate(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/sessions",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS, ...headers },
    payload: body,
  });
}

let tokenSequence = 0;

// Goes through the real HTTP routes so every WebAuthn value crosses the same JSON boundary a
// browser would; the emulator's bundled types don't match `@simplewebauthn/server`'s one-for-one.
async function requestRegistrationOptions(forUserId: string) {
  tokenSequence += 1;
  const rawToken = `raw-token-${tokenSequence}`;
  await db.insert(recoveryTokens).values({
    userId: forUserId,
    tokenHash: hashRecoveryToken(rawToken),
    issuedAt: currentTime,
    expiresAt: new Date(currentTime.getTime() + RECOVERY_TOKEN_LIFETIME_MS),
  });
  const response = await recoveryApp.inject({
    method: "POST",
    url: "/account-recovery-challenges",
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

async function registerPasskey(forUserId: string, emulator: WebAuthnEmulator) {
  const { rawToken, options } = await requestRegistrationOptions(forUserId);
  const credential = emulator.createJSON(BACKOFFICE_ORIGIN, options);
  const response = await recoveryApp.inject({
    method: "POST",
    url: "/account-recovery-redemptions",
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

function unregisteredCredentialAssertion() {
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

describe("POST /sessions", () => {
  it("no longer answers the old authenticate path", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/users/session/authenticate",
      headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS },
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });

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

  it("counts as a passkey authorization, setting passkey_authorized_at to the moment the session opened", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const assertion = await getAuthenticationAssertion(emulator);

    const response = await postAuthenticate({ assertion });

    expect(response.statusCode).toBe(200);
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(row?.passkeyAuthorizedAt).toEqual(currentTime);
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
    onTestFinished(async () => {
      await client.exec("alter table sessions drop column if exists injected_failure");
    });
    // A column with no default fails exactly the INSERT of the new session, while the revoke of
    // the incoming one (an UPDATE of an already-stored row) still goes through on its own.
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

  it("rejects an unknown credential as unknown_passkey, so the backoffice can tell the device to forget it", async () => {
    const registeredEmulator = new WebAuthnEmulator();
    await registerPasskey(userId, registeredEmulator);
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
      code: "unknown_passkey",
      message: expect.any(String),
    });
  });

  it("counts an unknown credential's rejected attempt toward the per-source lockout, on the same timing floor as any other rejection", async () => {
    const registeredEmulator = new WebAuthnEmulator();
    await registerPasskey(userId, registeredEmulator);
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

    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
      const optionsResponse = await postOptions();
      const authOptions = optionsResponse.json().passkey_authentication_options;
      const assertion = unregisteredEmulator.getJSON(BACKOFFICE_ORIGIN, authOptions);
      const response = await postAuthenticate({ assertion });
      expect(response.statusCode).toBe(401);
      expect(delaySpy).toHaveBeenCalled();
    }

    const optionsResponse = await postOptions();
    const authOptions = optionsResponse.json().passkey_authentication_options;
    const assertion = unregisteredEmulator.getJSON(BACKOFFICE_ORIGIN, authOptions);
    const eleventh = await postAuthenticate({ assertion });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
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

  it("rejects a deactivated account's passkey as authentication_failed, indistinguishable from a bad signature or a counter mismatch, and opens no session", async () => {
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

  it("rejects a tampered signature as authentication_failed, indistinguishable from a deactivated account's passkey or a counter mismatch", async () => {
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

  it("holds a failure's answer until the whole floor, started before the request reads the database, has passed", async () => {
    let releaseFloor = () => {};
    delaySpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseFloor = resolve;
        }),
    );
    const databaseUse = vi.fn();
    const floored = Fastify();
    registerSessionAuthenticateRoute(floored, {
      db: new Proxy(db, {
        get(target, property, receiver) {
          databaseUse(property);
          return Reflect.get(target, property, receiver);
        },
      }),
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => currentTime,
      delay: delaySpy,
    });
    onTestFinished(() => floored.close());
    databaseUse.mockClear();
    let answered = false;
    const answer = floored
      .inject({
        method: "POST",
        url: "/sessions",
        headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS },
        payload: { assertion: unregisteredCredentialAssertion() },
      })
      .then((response) => {
        answered = true;
        return response;
      });

    await vi.waitFor(() => expect(delaySpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(databaseUse).toHaveBeenCalled());
    expect(delaySpy).toHaveBeenCalledExactlyOnceWith(200);
    expect(delaySpy.mock.invocationCallOrder[0]).toBeLessThan(
      databaseUse.mock.invocationCallOrder[0] ?? 0,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(answered).toBe(false);

    releaseFloor();
    expect((await answer).statusCode).toBe(401);
  });

  it("answers a successful sign-in without waiting for the floor", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
    const assertion = await getAuthenticationAssertion(emulator);
    delaySpy.mockImplementation(() => new Promise<void>(() => {}));

    const response = await postAuthenticate({ assertion });

    expect(response.statusCode).toBe(200);
  });

  it("rejects a signature counter that does not exceed the stored one once it left zero", async () => {
    const emulator = new WebAuthnEmulator();
    await registerPasskey(userId, emulator);
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
      url: "/sessions",
      headers: { "x-real-ip": SOURCE_ADDRESS },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  describe("lockout", () => {
    it("blocks the 11th failed attempt from the same source address within an hour", async () => {
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
        const response = await postAuthenticate({ assertion: unregisteredCredentialAssertion() });
        expect(response.statusCode).toBe(401);
      }

      const eleventh = await postAuthenticate({ assertion: unregisteredCredentialAssertion() });

      expect(eleventh.statusCode).toBe(429);
      expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
      expect(eleventh.headers["retry-after"]).toBe(String(SIGN_IN_BLOCK_DURATION_MS / 1000));
    });

    it("checks the lockout before ever looking up a credential, so a locked address cannot sign in even with a valid passkey", async () => {
      const emulator = new WebAuthnEmulator();
      await registerPasskey(userId, emulator);
      for (let i = 0; i <= SIGN_IN_FAILURE_LIMIT; i++) {
        await postAuthenticate({ assertion: unregisteredCredentialAssertion() });
      }
      const assertion = await getAuthenticationAssertion(emulator);

      const response = await postAuthenticate({ assertion });

      expect(response.statusCode).toBe(429);
      const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
      expect(rows).toHaveLength(0);
    });

    it("never blocks a different source address", async () => {
      for (let i = 0; i <= SIGN_IN_FAILURE_LIMIT; i++) {
        await postAuthenticate(
          { assertion: unregisteredCredentialAssertion() },
          { "x-real-ip": "203.0.113.10" },
        );
      }

      const response = await postAuthenticate(
        { assertion: unregisteredCredentialAssertion() },
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
        const response = await postAuthenticate({ assertion: unregisteredCredentialAssertion() });
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
        await postAuthenticate({ assertion: unregisteredCredentialAssertion() });
      }
      const signedIn = await postAuthenticate({
        assertion: await getAuthenticationAssertion(emulator),
      });
      expect(signedIn.statusCode).toBe(200);

      const response = await postAuthenticate({ assertion: unregisteredCredentialAssertion() });

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
        url: "/sessions",
        headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS },
        payload: { assertion: unregisteredCredentialAssertion() },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "unknown_passkey" });
      expect(delaySpy).toHaveBeenCalled();
      expect(reportError).toHaveBeenCalled();
      await failing.close();
    });

    it("writes one backoffice_lockout audit row with no actor per block, however many attempts follow it", async () => {
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT + 3; i++) {
        await postAuthenticate({ assertion: unregisteredCredentialAssertion() });
      }

      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entity, "backoffice_lockout"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorId: null, at: currentTime });
      expect(rows[0]?.newValue).toMatchObject({ failureCount: SIGN_IN_FAILURE_LIMIT });
    });
  });
});
