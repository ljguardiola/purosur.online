import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog, passkeys, sessions } from "../platform/db/schema.js";
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
import { registerUserPasskeysRemovalRoute } from "./user-passkeys-removal-route.js";

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
  integrationDb = await createIntegrationDatabase("passkeys_removal_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerUserPasskeysRemovalRoute(app, {
    db,
    now: () => new Date(),
    backofficeOrigin: BACKOFFICE_ORIGIN,
  });
  registerPasskeyRaceRoutes(app, db);
});

afterEach(async () => {
  await app.close();
});

async function prepareRemoval(targetId: string) {
  const administrator = await signedInAdministrator();
  const headers = { origin: BACKOFFICE_ORIGIN, cookie: administrator.cookie };
  return () =>
    app.inject({
      method: "DELETE",
      url: `/users/${targetId}/passkeys`,
      headers,
    });
}

async function passkeyIdsOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
  return rows.map((row) => row.id);
}

describe("two Administrators removing every passkey of the same account at once on a real Postgres", () => {
  it("removes them once: one answers 200, the other no_passkeys, and each passkey is audited once", async () => {
    const targetId = await insertUser(false);
    await registerPasskey(targetId, newDeviceEmulator());
    await registerPasskey(targetId, newDeviceEmulator());
    const passkeyIds = await passkeyIdsOf(targetId);
    expect(passkeyIds).toHaveLength(2);
    const removeFirst = await prepareRemoval(targetId);
    const removeSecond = await prepareRemoval(targetId);

    const responses = await runQueuedBehindHeldLock(
      sql,
      (reserved) => reserved`select id from passkeys where user_id = ${targetId} for update`,
      removeFirst,
      removeSecond,
    );

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const loser = responses.find((response) => response.statusCode === 409);
    expect(loser?.json()).toMatchObject({ code: "no_passkeys" });
    expect(await passkeyIdsOf(targetId)).toEqual([]);
    const removalAudits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entity, "passkey"),
          inArray(auditLog.entityId, passkeyIds),
          isNull(auditLog.newValue),
        ),
      );
    expect(removalAudits.map((audit) => audit.entityId).sort()).toEqual([...passkeyIds].sort());
    const openAlerts = await db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.kind, "backoffice_passkey_changed"),
          eq(alerts.scope, targetId),
          isNull(alerts.resolvedAt),
        ),
      );
    expect(openAlerts).toHaveLength(1);
  });
});

describe("signing in with a passkey while an Administrator removes every passkey, on a real Postgres", () => {
  it("rejects the sign-in and leaves no live session when the removal commits first", async () => {
    const targetId = await insertUser(false);
    const targetEmulator = newDeviceEmulator();
    await registerPasskey(targetId, targetEmulator);
    const existingSession = await insertSession(targetId);
    const remove = await prepareRemoval(targetId);
    const signIn = await prepareSignIn(targetEmulator);

    const [removalResponse, signInResponse] = await runQueuedBehindHeldLock(
      sql,
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
    const remove = await prepareRemoval(targetId);
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
