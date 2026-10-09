import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { voidOutstandingRecoveryTokens } from "../credentials/void-outstanding-recovery-tokens.js";
import { auditLog, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserEditRoutes } from "./user-edit-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("user_email_change");
  sql = postgres(integrationDb.databaseUrl);
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerUserEditRoutes(app, {
    voidOutstandingRecoveryTokens,
    db,
    now: () => new Date(),
    backofficeOrigin: BACKOFFICE_ORIGIN,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertUser(email: string, roleId: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Grace Hopper", email, locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

async function administratorRoleId(): Promise<string> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!role) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return role.id;
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

describe("editing a user's email to a taken address on a real Postgres through postgres-js", () => {
  it("answers 409 email_taken and writes nothing", async () => {
    const suffix = randomUUID();
    const administratorId = await insertUser(
      `ada-${suffix}@example.com`,
      await administratorRoleId(),
    );
    const [cashierRole] = await db
      .insert(roles)
      .values({ name: `Cajera ${suffix}`, isAdministrator: false })
      .returning({ id: roles.id });
    if (!cashierRole) {
      throw new Error("test setup: seeding the role returned no row");
    }
    const targetId = await insertUser(`grace-${suffix}@example.com`, cashierRole.id);
    const takenEmail = `taken-${suffix}@example.com`;
    await insertUser(takenEmail, cashierRole.id);
    const cookie = `${SESSION_COOKIE_NAME}=${await insertSession(administratorId)}`;

    const response = await app.inject({
      method: "PUT",
      url: `/users/${targetId}`,
      headers: { origin: BACKOFFICE_ORIGIN, cookie },
      payload: { email: takenEmail, role_id: cashierRole.id, version: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "email_taken" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row).toMatchObject({ email: `grace-${suffix}@example.com`, version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(0);
  });
});
