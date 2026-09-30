import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, sessions, userPinCodes, userRoles, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerUserPinCodeRoutes } from "./user-pin-code-route.js";

// PGlite serializes every transaction, so racing requests can only interleave on a real Postgres
// pool; this test pins the order by holding the target's row lock until both requests are waiting.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("user_pin_code_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerUserPinCodeRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
});

afterEach(async () => {
  await app.close();
});

async function insertUser(email: string, isAdministrator: boolean): Promise<string> {
  const [role] = isAdministrator
    ? await db.select({ id: roles.id }).from(roles).where(eq(roles.isAdministrator, true))
    : await db
        .insert(roles)
        .values({ name: `Cajera ${randomUUID()}`, isAdministrator: false })
        .returning({ id: roles.id });
  const [user] = await db
    .insert(users)
    .values({ firstName: "Grace Hopper", email, locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!role || !user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  return user.id;
}

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  const now = new Date();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: now,
    lastSeenAt: now,
    passkeyAuthorizedAt: now,
  });
  return rawSessionId;
}

describe("emitting PIN codes for the same user at once on a real Postgres", () => {
  it("lets only one of two emissions through when just one is left under the hourly cap, leaving one live code", async () => {
    const actorId = await insertUser(`actor-${randomUUID()}@example.com`, true);
    const targetId = await insertUser(`target-${randomUUID()}@example.com`, false);
    const cookie = `${SESSION_COOKIE_NAME}=${await insertSession(actorId)}`;
    for (const minutes of [50, 40, 30, 20]) {
      const issuedAt = new Date(Date.now() - minutes * 60 * 1000);
      await db.insert(userPinCodes).values({
        userId: targetId,
        codeHash: `earlier-${randomUUID()}`,
        issuedBy: actorId,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
      });
    }

    const emit = () =>
      app.inject({
        method: "POST",
        url: `/users/${targetId}/pin-codes`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
      });

    const [firstResponse, secondResponse] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from users where id = ${targetId} for update`,
      emit,
      emit,
    );

    expect([firstResponse.statusCode, secondResponse.statusCode].sort()).toEqual([201, 429]);
    const codes = await db.select().from(userPinCodes).where(eq(userPinCodes.userId, targetId));
    expect(codes).toHaveLength(5);
    expect(
      codes.filter((code) => code.supersededAt === null && code.redeemedAt === null),
    ).toHaveLength(1);
  });
});
