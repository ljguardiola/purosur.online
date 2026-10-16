import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, sessions } from "../platform/db/schema.js";
import { hashSessionId } from "../sessions/session-id.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import {
  BACKOFFICE_ORIGIN,
  newDeviceEmulator,
  passkeyRaceFixture,
  registerPasskeyRaceRoutes,
} from "./test-support/passkey-race-fixture.js";
import { registerUserPasskeyRemovalRoutes } from "./user-passkey-removal-route.js";

// PGlite serializes every transaction, so racing requests can only interleave on a real Postgres
// pool; each test pins the order by holding a row lock until both requests queue behind it.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

const {
  insertUser,
  registerPasskey,
  insertSession,
  signedInAdministrator,
  prepareSignIn,
  liveSessionsOf,
} = passkeyRaceFixture({ db: () => db, app: () => app });

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
  registerUserPasskeyRemovalRoutes(app, {
    db,
    now: () => new Date(),
    backofficeOrigin: BACKOFFICE_ORIGIN,
  });
  registerPasskeyRaceRoutes(app, db);
});

afterEach(async () => {
  await app.close();
});

async function prepareRemoval(targetId: string, passkeyId: string) {
  const administrator = await signedInAdministrator();
  const headers = { origin: BACKOFFICE_ORIGIN, cookie: administrator.cookie };
  return () =>
    app.inject({
      method: "DELETE",
      url: `/users/${targetId}/passkeys/${passkeyId}`,
      headers,
    });
}

describe("two Administrators removing the same passkey at once on a real Postgres", () => {
  it("removes it once: one answers 200, the other not_found, and only one removal is audited", async () => {
    const targetId = await insertUser(false);
    const passkeyId = await registerPasskey(targetId, newDeviceEmulator());
    const removeFirst = await prepareRemoval(targetId, passkeyId);
    const removeSecond = await prepareRemoval(targetId, passkeyId);

    const responses = await runQueuedBehindHeldLock(
      sql,
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
    const [removalResponse, signInResponse] = await runQueuedBehindHeldLock(
      sql,
      (reserved) =>
        reserved`select id from sessions where session_id_hash = ${hashSessionId(existingSession)} for update`,
      remove,
      signIn,
    );

    expect(removalResponse.statusCode).toBe(200);
    expect(signInResponse.statusCode).toBe(401);
    // The passkey still existed when the sign-in looked it up, so it loses the race later,
    // updating zero rows — a different path from an unknown credential, but the same generic code.
    expect(signInResponse.json()).toMatchObject({ code: "authentication_failed" });
    expect(await liveSessionsOf(targetId)).toHaveLength(0);
  });

  it("ends the session the sign-in opened when the sign-in reaches the passkey first", async () => {
    const targetId = await insertUser(false);
    const targetEmulator = newDeviceEmulator();
    const passkeyId = await registerPasskey(targetId, targetEmulator);
    const remove = await prepareRemoval(targetId, passkeyId);
    const signIn = await prepareSignIn(targetEmulator);

    const [signInResponse, removalResponse] = await runQueuedBehindHeldLock(
      sql,
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
