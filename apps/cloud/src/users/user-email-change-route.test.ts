import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  locations,
  recoveryTokens,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { processRecoveryRequestJob } from "../recovery/process-recovery-request-job.js";
import { registerRecoveryRedemptionRoutes } from "../recovery/recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery/recovery-token-hash.js";
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "../session/passkey-authorization-guard.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserEmailChangeRoutes } from "./user-email-change-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let recoveryApp: FastifyInstance;
let administratorId: string;
let currentTime: Date;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function seededAdministratorRoleId(): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return administratorRole.id;
}

async function insertCashierRole(name: string): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  return role.id;
}

async function insertUser(input: {
  firstName: string;
  email: string;
  roleId: string;
  locationId: string;
}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: input.firstName, email: input.email, locationId: input.locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

/** Inserts a session, authorized (by default, at `currentTime`) unless `authorizedAt` is passed as `null`. */
async function insertSession(userId: string, authorizedAt: Date | null = NOON): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: authorizedAt,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function postJson(
  target: FastifyInstance,
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return target.inject({
    method: "POST",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
    payload: body,
  });
}

function changeEmail(
  targetId: string,
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return postJson(
    app,
    `/users/${targetId}/email`,
    body,
    rawSessionId ? { ...cookieHeader(rawSessionId), ...headers } : headers,
  );
}

beforeEach(async () => {
  await testDatabase.clear();

  const locationId = await seededLocationId(db);
  administratorId = await insertUser({
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    roleId: await seededAdministratorRoleId(),
    locationId,
  });

  currentTime = NOON;
  app = Fastify();
  registerUserEmailChangeRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
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

describe("POST /users/:id/email", () => {
  let cashierRoleId: string;
  let targetId: string;

  beforeEach(async () => {
    cashierRoleId = await insertCashierRole("Cajera");
    targetId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await changeEmail(targetId, undefined, {
      email: "new@example.com",
      version: 1,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: `/users/${targetId}/email`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden, changing nothing", async () => {
    const rawSessionId = await insertSession(targetId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "new@example.com",
      version: 1,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.email).toBe("grace@example.com");
  });

  it("answers the identical 404 for another branch's target id, a missing one, and a malformed one, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: seeding the other location returned no row");
    const strangerId = await insertUser({
      firstName: "Stranger",
      email: "stranger@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });
    const body = { email: "new@example.com", version: 1 };

    const crossBranchResponse = await changeEmail(strangerId, rawSessionId, body);
    const missingResponse = await changeEmail(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
      body,
    );
    const malformedResponse = await changeEmail("not-a-uuid", rawSessionId, body);

    expect(crossBranchResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(crossBranchResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
    const [strangerRow] = await db.select().from(users).where(eq(users.id, strangerId));
    expect(strangerRow?.email).toBe("stranger@example.com");
  });

  it("rejects a malformed email, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "not-an-email",
      version: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "email" }],
    });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.email).toBe("grace@example.com");
  });

  it("rejects a missing or non-positive version, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "new@example.com",
      version: 0,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "version" }],
    });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.email).toBe("grace@example.com");
  });

  it("returns 409 stale_version and changes nothing when the sent version does not match", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "new@example.com",
      version: 2,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row).toMatchObject({ email: "grace@example.com", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(0);
  });

  it("returns 409 email_taken and changes nothing when another user already has that email", async () => {
    await insertUser({
      firstName: "Existing User",
      email: "taken@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "Taken@Example.com",
      version: 1,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "email_taken" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row).toMatchObject({ email: "grace@example.com", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(0);
  });

  it("accepts the same normalized email as a no-op: 200, version unchanged, no audit row", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "Grace@Example.com",
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ id: targetId, email: "grace@example.com", version: 1 });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row).toMatchObject({ email: "grace@example.com", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(0);
  });

  it("stores the email normalized, bumps version, audits actor/previous/new, and returns 200 with the updated user", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "New.Email@Example.com",
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: targetId,
      first_name: "Grace Hopper",
      email: "new.email@example.com",
      version: 2,
      role: { id: cashierRoleId, is_administrator: false, name: "Cajera" },
      passkey_count: 0,
    });

    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row).toMatchObject({ email: "new.email@example.com", version: 2 });

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
    const changeAudit = audited.find((entry) => entry.entityId === targetId);
    expect(changeAudit).toMatchObject({
      actorId: administratorId,
      previousValue: { email: "grace@example.com" },
      newValue: { email: "new.email@example.com" },
    });
  });

  it("voids a live recovery link sent to the old address, auditing only the email change", async () => {
    const rawToken = "raw-token-for-the-old-address";
    await db.insert(recoveryTokens).values({
      userId: targetId,
      tokenHash: hashRecoveryToken(rawToken),
      issuedAt: currentTime,
      expiresAt: new Date(currentTime.getTime() + FIFTEEN_MINUTES_MS),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "new.email@example.com",
      version: 1,
    });
    expect(response.statusCode).toBe(200);
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      previousValue: { email: "grace@example.com" },
      newValue: { email: "new.email@example.com" },
    });

    const redemption = await recoveryApp.inject({
      method: "POST",
      url: "/users/recovery/registration-options",
      headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
      payload: { recovery_token: rawToken },
    });
    expect(redemption.statusCode).toBe(410);
    expect(redemption.json()).toMatchObject({ code: "recovery_token_burned" });
  });

  it("routes the next recovery request to the new address, never the old one", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await changeEmail(targetId, rawSessionId, {
      email: "new.email@example.com",
      version: 1,
    });
    expect(response.statusCode).toBe(200);

    const forOldAddress = await processRecoveryRequestJob(
      db,
      {
        email: "grace@example.com",
        requestedAt: currentTime.toISOString(),
        requestId: randomUUID(),
      },
      { now: () => currentTime, backofficeOrigin: BACKOFFICE_ORIGIN },
    );
    const forNewAddress = await processRecoveryRequestJob(
      db,
      {
        email: "new.email@example.com",
        requestedAt: currentTime.toISOString(),
        requestId: randomUUID(),
      },
      { now: () => currentTime, backofficeOrigin: BACKOFFICE_ORIGIN },
    );

    expect(forOldAddress.send).toBeUndefined();
    expect(forNewAddress.send).toMatchObject({ to: "new.email@example.com" });
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required and changes nothing when the session was never authorized", async () => {
      const rawSessionId = await insertSession(administratorId, null);

      const response = await changeEmail(targetId, rawSessionId, {
        email: "new@example.com",
        version: 1,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(users).where(eq(users.id, targetId));
      expect(row?.email).toBe("grace@example.com");
    });

    it("allows the action at exactly the 5-minute boundary", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await changeEmail(targetId, rawSessionId, {
        email: "new@example.com",
        version: 1,
      });

      expect(response.statusCode).toBe(200);
    });

    it("returns 401 authorization_required one second past the 5-minute boundary, changing nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await changeEmail(targetId, rawSessionId, {
        email: "new@example.com",
        version: 1,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(users).where(eq(users.id, targetId));
      expect(row?.email).toBe("grace@example.com");
    });
  });
});
