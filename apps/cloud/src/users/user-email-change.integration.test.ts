import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator from "nid-webauthn-emulator";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, recoveryTokens, roles, sessions, userRoles, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserEmailChangeRoutes } from "./user-email-change-route.js";

// PGlite reports a unique violation with its own error shape; production talks to Postgres
// through postgres-js, whose error names the violated index differently. This proves the taken
// address the email UPDATE runs into is still answered as email_taken on that real driver.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;
let recoveryApp: FastifyInstance;

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
  registerUserEmailChangeRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
  recoveryApp = Fastify();
  registerRecoveryRedemptionRoutes(recoveryApp, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
});

afterEach(async () => {
  await app.close();
  await recoveryApp.close();
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

async function registerPasskey(userId: string, emulator: WebAuthnEmulator): Promise<void> {
  const rawToken = `raw-token-${randomUUID()}`;
  await db.insert(recoveryTokens).values({
    userId,
    tokenHash: hashRecoveryToken(rawToken),
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + FIFTEEN_MINUTES_MS),
  });
  const headers = { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" };
  const options = await recoveryApp.inject({
    method: "POST",
    url: "/users/recovery/registration-options",
    headers,
    payload: { recovery_token: rawToken },
  });
  const credential = emulator.createJSON(
    BACKOFFICE_ORIGIN,
    options.json().passkey_registration_options,
  );
  const redeemed = await recoveryApp.inject({
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
}

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  const now = new Date();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: now,
    lastSeenAt: now,
  });
  return rawSessionId;
}

describe("changing a user's email to a taken address on a real Postgres through postgres-js", () => {
  it("answers 409 email_taken and writes nothing", async () => {
    const suffix = randomUUID();
    const administratorId = await insertUser(
      `ada-${suffix}@example.com`,
      await administratorRoleId(),
    );
    const emulator = new WebAuthnEmulator();
    await registerPasskey(administratorId, emulator);
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

    const options = await app.inject({
      method: "POST",
      url: `/users/${targetId}/email-change-options`,
      headers: { origin: BACKOFFICE_ORIGIN, cookie },
    });
    expect(options.statusCode).toBe(200);
    const reauthentication = emulator.getJSON(
      BACKOFFICE_ORIGIN,
      options.json().reauthentication_options,
    );

    const response = await app.inject({
      method: "POST",
      url: `/users/${targetId}/email`,
      headers: { origin: BACKOFFICE_ORIGIN, cookie },
      payload: { email: takenEmail, version: 1, reauthentication },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "email_taken" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row).toMatchObject({ email: `grace-${suffix}@example.com`, version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(0);
  });
});
