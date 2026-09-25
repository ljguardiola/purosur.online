import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from "fastify";
import WebAuthnEmulator, {
  AuthenticatorEmulator,
  PasskeysCredentialsMemoryRepository,
} from "nid-webauthn-emulator";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  passkeys,
  recoveryTokens,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { registerSessionAuthenticateRoute } from "../session/session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "../session/session-authentication-options-route.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserPasskeyRemovalRoutes } from "./user-passkey-removal-route.js";

// PGlite serves every query on one connection and serializes transactions outright, so racing
// requests can only interleave on a real Postgres pool. Each test pins the interleaving by holding
// a row lock on a connection of its own and waiting until the requests queue behind it, so the
// order in which they reach the database is decided by the test, not by timing.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;
let addressSequence = 0;

/** A source address of its own per request, so no per-address rate limit or lockout builds up. */
function nextSourceAddress(): string {
  addressSequence += 1;
  return `198.51.100.${addressSequence}`;
}

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("passkey_removal_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerUserPasskeyRemovalRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
  registerRecoveryRedemptionRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
  registerSessionAuthenticationOptionsRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
  registerSessionAuthenticateRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    delay: async () => {},
  });
});

afterEach(async () => {
  await app.close();
});

function newDeviceEmulator(): WebAuthnEmulator {
  return new WebAuthnEmulator(
    new AuthenticatorEmulator({ credentialsRepository: new PasskeysCredentialsMemoryRepository() }),
  );
}

async function roleId(isAdministrator: boolean): Promise<string> {
  if (isAdministrator) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));
    if (!role) throw new Error("test setup: no Administrator role seeded");
    return role.id;
  }
  const [role] = await db
    .insert(roles)
    .values({ name: `Cajera ${randomUUID()}`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) throw new Error("test setup: seeding the role returned no row");
  return role.id;
}

async function insertUser(isAdministrator: boolean): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Grace Hopper",
      email: `user-${randomUUID()}@example.com`,
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) throw new Error("test setup: seeding the user returned no row");
  await db.insert(userRoles).values({ userId: user.id, roleId: await roleId(isAdministrator) });
  return user.id;
}

async function registerPasskey(userId: string, emulator: WebAuthnEmulator): Promise<string> {
  const rawToken = `raw-token-${randomUUID()}`;
  await db.insert(recoveryTokens).values({
    userId,
    tokenHash: hashRecoveryToken(rawToken),
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + FIFTEEN_MINUTES_MS),
  });
  const headers = { origin: BACKOFFICE_ORIGIN, "x-real-ip": nextSourceAddress() };
  const options = await app.inject({
    method: "POST",
    url: "/users/recovery/registration-options",
    headers,
    payload: { recovery_token: rawToken },
  });
  const credential = emulator.createJSON(
    BACKOFFICE_ORIGIN,
    options.json().passkey_registration_options,
  );
  const redeemed = await app.inject({
    method: "POST",
    url: "/users/recovery/redeem",
    headers,
    payload: {
      recovery_token: rawToken,
      passkey_registration: credential,
      passkey_name: "Notebook del local",
    },
  });
  if (redeemed.statusCode !== 200) {
    throw new Error(`test setup: redeem failed: ${redeemed.statusCode} ${redeemed.body}`);
  }
  const [row] = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
  if (!row) throw new Error("test setup: the registered passkey was not found");
  return row.id;
}

/** Inserts a session, carrying a valid passkey authorization (the way a passkey sign-in would) unless `authorized` is `false`. */
async function insertSession(userId: string, authorized = true): Promise<string> {
  const rawSessionId = generateSessionId();
  const now = new Date();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: now,
    lastSeenAt: now,
    passkeyAuthorizedAt: authorized ? now : null,
  });
  return rawSessionId;
}

async function signedInAdministrator(): Promise<{ cookie: string; emulator: WebAuthnEmulator }> {
  const administratorId = await insertUser(true);
  const emulator = newDeviceEmulator();
  await registerPasskey(administratorId, emulator);
  return { cookie: `${SESSION_COOKIE_NAME}=${await insertSession(administratorId)}`, emulator };
}

/** Everything up to the removal itself, so only the removal request is left to race. */
async function prepareRemoval(targetId: string, passkeyId: string) {
  const administrator = await signedInAdministrator();
  const headers = { origin: BACKOFFICE_ORIGIN, cookie: administrator.cookie };
  return () =>
    app.inject({
      method: "POST",
      url: `/users/${targetId}/passkeys/${passkeyId}/remove`,
      headers,
    });
}

/** Everything up to the sign-in itself, so only the authenticate request is left to race. */
async function prepareSignIn(emulator: WebAuthnEmulator) {
  const headers = { origin: BACKOFFICE_ORIGIN, "x-real-ip": nextSourceAddress() };
  const options = await app.inject({
    method: "POST",
    url: "/users/session/authentication-options",
    headers,
  });
  const assertion = emulator.getJSON(
    BACKOFFICE_ORIGIN,
    options.json().passkey_authentication_options,
  );
  return () =>
    app.inject({
      method: "POST",
      url: "/users/session/authenticate",
      headers,
      payload: { assertion },
    });
}

async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await sql<{ waiting: number }[]>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`test setup: ${count} requests never queued behind the held lock`);
}

type InjectRequest = () => Promise<LightMyRequestResponse>;

/**
 * Holds `FOR UPDATE` on the rows `lockQuery` selects, starts `first`, starts `second` only once
 * `first` is waiting on a lock, then lets both go once `second` waits too. The rows are released
 * and both requests settled even when one never queues, so no waiter outlives its test and
 * inflates the next one's count.
 */
async function runQueuedBehindRowLock(
  lockQuery: (reserved: postgres.ReservedSql) => Promise<unknown>,
  first: InjectRequest,
  second: InjectRequest,
): Promise<[LightMyRequestResponse, LightMyRequestResponse]> {
  const reserved = await sql.reserve();
  let firstResponse: Promise<LightMyRequestResponse> | undefined;
  let secondResponse: Promise<LightMyRequestResponse> | undefined;
  try {
    await reserved`begin`;
    await lockQuery(reserved);
    firstResponse = first();
    await waitForLockWaiters(1);
    secondResponse = second();
    await waitForLockWaiters(2);
  } finally {
    await reserved`rollback`;
    reserved.release();
    await Promise.allSettled([firstResponse, secondResponse]);
  }
  return Promise.all([firstResponse, secondResponse]);
}

async function liveSessionsOf(userId: string) {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

describe("two Administrators removing the same passkey at once on a real Postgres", () => {
  it("removes it once: one answers 200, the other not_found, and only one removal is audited", async () => {
    const targetId = await insertUser(false);
    const passkeyId = await registerPasskey(targetId, newDeviceEmulator());
    const removeFirst = await prepareRemoval(targetId, passkeyId);
    const removeSecond = await prepareRemoval(targetId, passkeyId);

    const responses = await runQueuedBehindRowLock(
      (reserved) => reserved`select id from passkeys where id = ${passkeyId} for update`,
      removeFirst,
      removeSecond,
    );

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 404]);
    const loser = responses.find((response) => response.statusCode === 404);
    expect(loser?.json()).toMatchObject({ code: "not_found" });
    const removalAudits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entity, "passkey"),
          eq(auditLog.entityId, passkeyId),
          isNull(auditLog.newValue),
        ),
      );
    expect(removalAudits).toHaveLength(1);
  });
});

describe("signing in with a passkey while an Administrator removes it, on a real Postgres", () => {
  it("rejects the sign-in and leaves no live session when the removal commits first", async () => {
    const targetId = await insertUser(false);
    const targetEmulator = newDeviceEmulator();
    const passkeyId = await registerPasskey(targetId, targetEmulator);
    const existingSession = await insertSession(targetId);
    const remove = await prepareRemoval(targetId, passkeyId);
    const signIn = await prepareSignIn(targetEmulator);

    // Parks the removal after it has deleted the passkey but before it has ended the target's
    // sessions, so the sign-in arrives while the removal is still uncommitted.
    const [removalResponse, signInResponse] = await runQueuedBehindRowLock(
      (reserved) =>
        reserved`select id from sessions where session_id_hash = ${hashSessionId(existingSession)} for update`,
      remove,
      signIn,
    );

    expect(removalResponse.statusCode).toBe(200);
    expect(signInResponse.statusCode).toBe(401);
    expect(signInResponse.json()).toMatchObject({ code: "authentication_failed" });
    expect(await liveSessionsOf(targetId)).toHaveLength(0);
  });

  it("ends the session the sign-in opened when the sign-in reaches the passkey first", async () => {
    const targetId = await insertUser(false);
    const targetEmulator = newDeviceEmulator();
    const passkeyId = await registerPasskey(targetId, targetEmulator);
    const remove = await prepareRemoval(targetId, passkeyId);
    const signIn = await prepareSignIn(targetEmulator);

    const [signInResponse, removalResponse] = await runQueuedBehindRowLock(
      (reserved) => reserved`select id from passkeys where id = ${passkeyId} for update`,
      signIn,
      remove,
    );

    expect(signInResponse.statusCode).toBe(200);
    expect(removalResponse.statusCode).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.userId, targetId))).toHaveLength(1);
    expect(await liveSessionsOf(targetId)).toHaveLength(0);
  });
});
