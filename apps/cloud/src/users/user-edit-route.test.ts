import { randomUUID } from "node:crypto";
import { PASSKEY_AUTHORIZATION_WINDOW_MS, RECOVERY_TOKEN_LIFETIME_MS } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processRecoveryRequestJob } from "../credentials/process-recovery-request-job.js";
import { registerRecoveryRedemptionRoutes } from "../credentials/recovery-redemption-route.js";
import { hashRecoveryToken } from "../credentials/recovery-token-hash.js";
import { voidOutstandingRecoveryTokens } from "../credentials/void-outstanding-recovery-tokens.js";
import {
  alerts,
  auditLog,
  locations,
  recoveryTokens,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserEditRoutes } from "./user-edit-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

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

async function roleOf(userId: string): Promise<string | undefined> {
  const [row] = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  return row?.roleId;
}

async function insertSession(userId: string, authorizedAt: Date = NOON): Promise<string> {
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

function putJson(
  target: FastifyInstance,
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return target.inject({
    method: "PUT",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
    payload: body,
  });
}

// Runs `change` right after the route's own transaction commits: the race window between that
// commit and the route's answer.
function withChangeAfterCommit(change: () => Promise<unknown>): TestDatabase["db"] {
  let targetRead = false;
  let changed = false;
  return new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (property === "select") {
        return function (this: unknown, ...args: unknown[]) {
          const [fields] = args;
          if (typeof fields === "object" && fields !== null && "roleIsAdministrator" in fields) {
            targetRead = true;
          }
          return Reflect.apply(value, this, args);
        };
      }
      if (property === "transaction") {
        return async function (this: unknown, ...args: unknown[]) {
          const result: unknown = await Reflect.apply(value, this, args);
          if (targetRead && !changed) {
            changed = true;
            await change();
          }
          return result;
        };
      }
      return value;
    },
  });
}

function editUser(
  targetId: string,
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return putJson(
    app,
    `/users/${targetId}`,
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
  registerUserEditRoutes(app, {
    voidOutstandingRecoveryTokens,
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

describe("PUT /users/:id", () => {
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
    const response = await editUser(targetId, undefined, {
      email: "new@example.com",
      role_id: cashierRoleId,
      version: 1,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("no longer answers the old edit path", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: `/users/${targetId}/edit`,
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
      payload: { email: "new@example.com", role_id: cashierRoleId, version: 1 },
    });

    expect(response.statusCode).toBe(404);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "PUT",
      url: `/users/${targetId}`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden, changing nothing", async () => {
    const rawSessionId = await insertSession(targetId);

    const response = await editUser(targetId, rawSessionId, {
      email: "new@example.com",
      role_id: cashierRoleId,
      version: 1,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.email).toBe("grace@example.com");
    expect(await roleOf(targetId)).toBe(cashierRoleId);
  });

  it("answers not_found for an inactive target, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    await db.update(users).set({ active: false }).where(eq(users.id, targetId));

    const response = await editUser(targetId, rawSessionId, {
      email: "new@example.com",
      role_id: cashierRoleId,
      version: 1,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 400 validation_failed naming id for a malformed id, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser("not-a-uuid", rawSessionId, {
      email: "new@example.com",
      role_id: cashierRoleId,
      version: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.email).toBe("grace@example.com");
  });

  it("answers the identical 404 for another branch's target id and a missing one, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: seeding the other location returned no row");
    const strangerId = await insertUser({
      firstName: "Stranger",
      email: "stranger@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });
    const body = { email: "new@example.com", role_id: cashierRoleId, version: 1 };

    const crossBranchResponse = await editUser(strangerId, rawSessionId, body);
    const missingResponse = await editUser(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
      body,
    );

    expect(crossBranchResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(crossBranchResponse.json()).toEqual(missingResponse.json());
  });

  it("rejects a malformed email, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "not-an-email",
      role_id: cashierRoleId,
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

  it("rejects a role_id that does not belong to any role, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "new@example.com",
      role_id: "00000000-0000-0000-0000-000000000000",
      version: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "role_id" }],
    });
    expect(await roleOf(targetId)).toBe(cashierRoleId);
  });

  it("returns 409 stale_version and changes nothing when the sent version does not match", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "new@example.com",
      role_id: cashierRoleId,
      version: 2,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row).toMatchObject({ email: "grace@example.com", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(0);
    const opened = await db.select().from(alerts).where(eq(alerts.kind, "user_email_changed"));
    expect(opened).toHaveLength(0);
  });

  it("returns 409 email_taken and changes nothing when another user already has that email", async () => {
    await insertUser({
      firstName: "Existing User",
      email: "taken@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "Taken@Example.com",
      role_id: cashierRoleId,
      version: 1,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "email_taken" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row).toMatchObject({ email: "grace@example.com", version: 1 });
    const opened = await db.select().from(alerts).where(eq(alerts.kind, "user_email_changed"));
    expect(opened).toHaveLength(0);
  });

  it("accepts the same normalized email and the same role as a no-op: 200, version unchanged, no audit row", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "Grace@Example.com",
      role_id: cashierRoleId,
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

  it("changes only the email: bumps version once, audits only the email, voids a live recovery link", async () => {
    const rawToken = "raw-token-for-the-old-address";
    await db.insert(recoveryTokens).values({
      userId: targetId,
      tokenHash: hashRecoveryToken(rawToken),
      issuedAt: currentTime,
      expiresAt: new Date(currentTime.getTime() + RECOVERY_TOKEN_LIFETIME_MS),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "New.Email@Example.com",
      role_id: cashierRoleId,
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
      is_last_active_administrator: false,
      may_emit_pin_code: true,
      may_edit: true,
      may_deactivate: true,
      may_reactivate: false,
      may_remove_passkey: true,
    });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      actorId: administratorId,
      previousValue: { email: "grace@example.com" },
      newValue: { email: "new.email@example.com" },
      at: currentTime,
    });

    const opened = await db.select().from(alerts).where(eq(alerts.kind, "user_email_changed"));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      scope: targetId,
      audience: "all",
      level: "warning",
      resolvedAt: null,
      detail: {
        previousEmail: "grace@example.com",
        newEmail: "new.email@example.com",
        actorId: administratorId,
      },
    });

    const redemption = await recoveryApp.inject({
      method: "POST",
      url: "/account-recovery-challenges",
      headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
      payload: { recovery_token: rawToken },
    });
    expect(redemption.statusCode).toBe(410);
    expect(redemption.json()).toMatchObject({ code: "recovery_token_burned" });
  });

  it("routes the next recovery request to the new address, never the old one", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "new.email@example.com",
      role_id: cashierRoleId,
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

  it("changes only the role: bumps version once, audits only the role, voids no recovery link", async () => {
    const encargadaRoleId = await insertCashierRole("Encargada");
    const rawToken = "raw-token-for-the-unchanged-address";
    await db.insert(recoveryTokens).values({
      userId: targetId,
      tokenHash: hashRecoveryToken(rawToken),
      issuedAt: currentTime,
      expiresAt: new Date(currentTime.getTime() + RECOVERY_TOKEN_LIFETIME_MS),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "grace@example.com",
      role_id: encargadaRoleId,
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: targetId,
      first_name: "Grace Hopper",
      email: "grace@example.com",
      version: 2,
      role: { id: encargadaRoleId, is_administrator: false, name: "Encargada" },
      passkey_count: 0,
      is_last_active_administrator: false,
      may_emit_pin_code: true,
      may_edit: true,
      may_deactivate: true,
      may_reactivate: false,
      may_remove_passkey: true,
    });
    expect(await roleOf(targetId)).toBe(encargadaRoleId);
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      actorId: administratorId,
      previousValue: { roleId: cashierRoleId },
      newValue: { roleId: encargadaRoleId },
      at: currentTime,
    });
    const opened = await db.select().from(alerts).where(eq(alerts.kind, "user_email_changed"));
    expect(opened).toHaveLength(0);

    const redemption = await recoveryApp.inject({
      method: "POST",
      url: "/account-recovery-challenges",
      headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.11" },
      payload: { recovery_token: rawToken },
    });
    expect(redemption.statusCode).not.toBe(410);
  });

  it("logs a changed role as an update of the user's next version, in the user's branch", async () => {
    const encargadaRoleId = await insertCashierRole("Encargada");
    const rawSessionId = await insertSession(administratorId);
    const mark = await lastLoggedChangeSeq(db);

    await editUser(targetId, rawSessionId, {
      email: "grace@example.com",
      role_id: encargadaRoleId,
      version: 1,
    });

    expect(await changesLoggedAfter(db, mark)).toEqual([
      {
        entity: "user",
        entityId: targetId,
        version: 2,
        op: "update",
        locationId: await seededLocationId(db),
      },
    ]);
  });

  it("logs a no-op edit as nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const mark = await lastLoggedChangeSeq(db);

    await editUser(targetId, rawSessionId, {
      email: "grace@example.com",
      role_id: cashierRoleId,
      version: 1,
    });

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });

  it("logs nothing for an edit refused as stale", async () => {
    const rawSessionId = await insertSession(administratorId);
    const mark = await lastLoggedChangeSeq(db);

    await editUser(targetId, rawSessionId, {
      email: "other@example.com",
      role_id: cashierRoleId,
      version: 7,
    });

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });

  it("changes both email and role together: bumps version once and writes one audit row per changed field", async () => {
    const encargadaRoleId = await insertCashierRole("Encargada");
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "new.email@example.com",
      role_id: encargadaRoleId,
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ email: "new.email@example.com", version: 2 });
    expect(await roleOf(targetId)).toBe(encargadaRoleId);
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(2);
    expect(audited).toContainEqual(
      expect.objectContaining({
        previousValue: { email: "grace@example.com" },
        newValue: { email: "new.email@example.com" },
      }),
    );
    expect(audited).toContainEqual(
      expect.objectContaining({
        previousValue: { roleId: cashierRoleId },
        newValue: { roleId: encargadaRoleId },
      }),
    );
  });

  it("answers with the edit it applied even when the user is deactivated right after it commits", async () => {
    const rawSessionId = await insertSession(administratorId);
    const racedApp = Fastify();
    registerUserEditRoutes(racedApp, {
      voidOutstandingRecoveryTokens,
      db: withChangeAfterCommit(() =>
        db.update(users).set({ active: false, version: 3 }).where(eq(users.id, targetId)),
      ),
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => currentTime,
    });

    const response = await putJson(
      racedApp,
      `/users/${targetId}`,
      { email: "new.email@example.com", role_id: cashierRoleId, version: 1 },
      cookieHeader(rawSessionId),
    );
    await racedApp.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: targetId,
      first_name: "Grace Hopper",
      email: "new.email@example.com",
      version: 2,
      role: { id: cashierRoleId, is_administrator: false, name: "Cajera" },
      passkey_count: 0,
      is_last_active_administrator: false,
      may_emit_pin_code: true,
      may_edit: true,
      may_deactivate: true,
      may_reactivate: false,
      may_remove_passkey: true,
    });
  });

  it("answers 401 unauthenticated, keeping the edit, when the session is revoked right after it commits", async () => {
    const rawSessionId = await insertSession(administratorId);
    const racedApp = Fastify();
    registerUserEditRoutes(racedApp, {
      voidOutstandingRecoveryTokens,
      db: withChangeAfterCommit(() =>
        db
          .update(sessions)
          .set({ revokedAt: NOON })
          .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId))),
      ),
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => currentTime,
    });

    const response = await putJson(
      racedApp,
      `/users/${targetId}`,
      { email: "new.email@example.com", role_id: cashierRoleId, version: 1 },
      cookieHeader(rawSessionId),
    );
    await racedApp.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.email).toBe("new.email@example.com");
  });

  it("answers a promotion to Administrator with the promoted user no longer the last active one", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    const rawSessionId = await insertSession(administratorId);

    const response = await editUser(targetId, rawSessionId, {
      email: "grace@example.com",
      role_id: administratorRoleId,
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      version: 2,
      role: { id: administratorRoleId, is_administrator: true },
      is_last_active_administrator: false,
      may_emit_pin_code: true,
      may_edit: true,
      may_deactivate: false,
      may_reactivate: false,
      may_remove_passkey: true,
    });
  });

  describe("the last active Administrator", () => {
    it("refuses to change their role away from Administrator, changing nothing", async () => {
      const rawSessionId = await insertSession(administratorId);

      const response = await editUser(administratorId, rawSessionId, {
        email: "ada@example.com",
        role_id: cashierRoleId,
        version: 1,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "last_administrator" });
      expect(await roleOf(administratorId)).toBe(await seededAdministratorRoleId());
      const audited = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, administratorId));
      expect(audited).toHaveLength(0);
    });

    it("still allows changing the last active Administrator's own email", async () => {
      const rawSessionId = await insertSession(administratorId);

      const response = await editUser(administratorId, rawSessionId, {
        email: "ada.lovelace@example.com",
        role_id: await seededAdministratorRoleId(),
        version: 1,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        email: "ada.lovelace@example.com",
        is_last_active_administrator: true,
        may_emit_pin_code: true,
        may_edit: true,
        may_deactivate: false,
        may_reactivate: false,
        may_remove_passkey: false,
      });
    });

    it("allows the change once a second active Administrator exists", async () => {
      const administratorRoleId = await seededAdministratorRoleId();
      await insertUser({
        firstName: "Zoe Second",
        email: "zoe@example.com",
        roleId: administratorRoleId,
        locationId: await seededLocationId(db),
      });
      const rawSessionId = await insertSession(administratorId);

      const response = await editUser(administratorId, rawSessionId, {
        email: "ada@example.com",
        role_id: cashierRoleId,
        version: 1,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        role: { id: cashierRoleId },
        is_last_active_administrator: false,
      });
      expect(await roleOf(administratorId)).toBe(cashierRoleId);
    });

    it("answers what the person may do with their own account from the role they just moved to", async () => {
      await insertUser({
        firstName: "Zoe Second",
        email: "zoe@example.com",
        roleId: await seededAdministratorRoleId(),
        locationId: await seededLocationId(db),
      });
      const rawSessionId = await insertSession(administratorId);

      const response = await editUser(administratorId, rawSessionId, {
        email: "ada@example.com",
        role_id: cashierRoleId,
        version: 1,
      });
      const nextEdit = await editUser(administratorId, rawSessionId, {
        email: "ada@example.com",
        role_id: cashierRoleId,
        version: 2,
      });

      expect(response.json()).toMatchObject({
        may_emit_pin_code: true,
        may_edit: false,
        may_deactivate: false,
        may_reactivate: false,
        may_remove_passkey: false,
      });
      expect(nextEdit.statusCode).toBe(403);
    });
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required when the session's passkey authorization is stale, changing nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await editUser(targetId, rawSessionId, {
        email: "new@example.com",
        role_id: cashierRoleId,
        version: 1,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(users).where(eq(users.id, targetId));
      expect(row?.email).toBe("grace@example.com");
    });

    it("returns 401 authorization_required, not 404, for a missing target when the session's passkey authorization is stale, changing nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await editUser("00000000-0000-0000-0000-000000000000", rawSessionId, {
        email: "new@example.com",
        role_id: cashierRoleId,
        version: 1,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(users).where(eq(users.id, targetId));
      expect(row?.email).toBe("grace@example.com");
    });
  });
});

describe("PUT /users/:id and the alert for increased access", () => {
  let targetId: string;

  async function insertRoleWithPermissions(
    name: string,
    permissionKeys: string[],
  ): Promise<string> {
    const roleId = await insertCashierRole(name);
    await db
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId, permissionKey })));
    return roleId;
  }

  async function assignRole(userId: string, roleId: string, version = 1) {
    const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    return editUser(userId, await insertSession(administratorId), {
      email: row?.email,
      role_id: roleId,
      version,
    });
  }

  async function accessIncreasedAlerts() {
    return db.select().from(alerts).where(eq(alerts.kind, "user_access_increased"));
  }

  beforeEach(async () => {
    targetId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: await insertRoleWithPermissions("Cajera", ["sell_and_charge", "void_sale"]),
      locationId: await seededLocationId(db),
    });
  });

  it("opens one Critical, All-audience alert scoped to the user made Administrator, never resolving on its own", async () => {
    const response = await assignRole(targetId, await seededAdministratorRoleId());

    expect(response.statusCode).toBe(200);
    const opened = await accessIncreasedAlerts();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      scope: targetId,
      level: "critical",
      audience: "all",
      escalateAt: null,
      resolvedAt: null,
      detail: {
        cause: "role_assigned",
        previousRole: { name: "Cajera", isAdministrator: false },
        newRole: { name: null, isAdministrator: true },
        actorId: administratorId,
      },
    });
  });

  it("opens the alert when the user is assigned a role that gives them a permission they did not have", async () => {
    const encargadaRoleId = await insertRoleWithPermissions("Encargada", [
      "sell_and_charge",
      "adjust_stock",
    ]);

    const response = await assignRole(targetId, encargadaRoleId);

    expect(response.statusCode).toBe(200);
    const opened = await accessIncreasedAlerts();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      scope: targetId,
      level: "critical",
      audience: "all",
      detail: {
        cause: "role_assigned",
        previousRole: { name: "Cajera", isAdministrator: false },
        newRole: { name: "Encargada", isAdministrator: false },
        actorId: administratorId,
      },
    });
  });

  it("opens a second alert for a second increase, leaving the first open as it was", async () => {
    const encargadaRoleId = await insertRoleWithPermissions("Encargada", [
      "sell_and_charge",
      "void_sale",
      "adjust_stock",
    ]);
    await assignRole(targetId, encargadaRoleId);
    const [first] = await accessIncreasedAlerts();

    const response = await assignRole(targetId, await seededAdministratorRoleId(), 2);

    expect(response.statusCode).toBe(200);
    const opened = await accessIncreasedAlerts();
    expect(opened).toHaveLength(2);
    expect(opened).toContainEqual(first);
    expect(opened).toContainEqual(
      expect.objectContaining({
        scope: targetId,
        resolvedAt: null,
        detail: expect.objectContaining({ newRole: { name: null, isAdministrator: true } }),
      }),
    );
  });

  it("opens no alert when the user is assigned a role whose permissions they already had", async () => {
    const fewerRoleId = await insertRoleWithPermissions("Repositora", ["sell_and_charge"]);

    const response = await assignRole(targetId, fewerRoleId);

    expect(response.statusCode).toBe(200);
    expect(await roleOf(targetId)).toBe(fewerRoleId);
    expect(await accessIncreasedAlerts()).toHaveLength(0);
  });

  it("opens no alert when an Administrator is assigned any other role", async () => {
    const secondAdministratorId = await insertUser({
      firstName: "Katherine Johnson",
      email: "katherine@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const everyPermissionRoleId = await insertRoleWithPermissions("Encargada", [
      "sell_and_charge",
      "void_sale",
      "adjust_stock",
    ]);

    const response = await assignRole(secondAdministratorId, everyPermissionRoleId);

    expect(response.statusCode).toBe(200);
    expect(await roleOf(secondAdministratorId)).toBe(everyPermissionRoleId);
    expect(await accessIncreasedAlerts()).toHaveLength(0);
  });

  it("opens no alert when only the email changes", async () => {
    const response = await editUser(targetId, await insertSession(administratorId), {
      email: "new.email@example.com",
      role_id: await roleOf(targetId),
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(await accessIncreasedAlerts()).toHaveLength(0);
  });
});
