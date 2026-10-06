import { userPinCodeSchema } from "@purosur/contracts";
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "@purosur/domain";
import { and, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  rolePermissions,
  roles,
  sessions,
  userPinCodes,
  userPins,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerUserPinCodeRoutes } from "./user-pin-code-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
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

async function insertRole(name: string, permissionKeys: string[] = []): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  if (permissionKeys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }
  return role.id;
}

async function insertUser(input: {
  firstName: string;
  email: string;
  roleId: string;
  active?: boolean;
}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: input.firstName,
      email: input.email,
      locationId: await seededLocationId(db),
      active: input.active ?? true,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
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

function emitPinCode(targetId: string, rawSessionId: string | undefined) {
  return app.inject({
    method: "POST",
    url: `/users/${targetId}/pin-codes`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
  });
}

async function insertEarlierCode(userId: string, issuedAt: Date): Promise<void> {
  await db.insert(userPinCodes).values({
    userId,
    codeHash: `earlier-${issuedAt.getTime()}-${userId}`,
    issuedBy: administratorId,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
  });
}

async function codesOf(userId: string) {
  return db.select().from(userPinCodes).where(eq(userPinCodes.userId, userId));
}

beforeEach(async () => {
  await testDatabase.clear();

  administratorId = await insertUser({
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    roleId: await seededAdministratorRoleId(),
  });

  currentTime = NOON;
  app = Fastify();
  registerUserPinCodeRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
});

describe("POST /users/:id/pin-codes", () => {
  let holderId: string;
  let holderSession: string;
  let targetId: string;

  beforeEach(async () => {
    holderId = await insertUser({
      firstName: "Barbara Liskov",
      email: "barbara@example.com",
      roleId: await insertRole("Encargada", ["reset_user_pin"]),
    });
    holderSession = await insertSession(holderId);
    targetId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: await insertRole("Cajera"),
    });
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await emitPinCode(targetId, undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/users/${targetId}/pin-codes`,
      headers: { origin: "https://attacker.example", ...cookieHeader(holderSession) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await codesOf(targetId)).toHaveLength(0);
  });

  it("rejects a user without the reset_user_pin permission with 403 forbidden, emitting nothing", async () => {
    const withoutPermission = await insertSession(targetId);

    const response = await emitPinCode(holderId, withoutPermission);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await codesOf(holderId)).toHaveLength(0);
  });

  it("answers 400 validation_failed naming id for a malformed target id, emitting nothing", async () => {
    const response = await emitPinCode("not-a-uuid", holderSession);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
    expect(await codesOf(holderId)).toHaveLength(0);
  });

  describe("a target out of the actor's standing", () => {
    it("answers the same 404 for a missing target and an Administrator", async () => {
      const missing = await emitPinCode(MISSING_ID, holderSession);
      const administrator = await emitPinCode(administratorId, holderSession);

      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: "not_found" });
      expect(administrator.statusCode).toBe(404);
      expect(administrator.json()).toEqual(missing.json());
      expect(await codesOf(administratorId)).toHaveLength(0);
    });
  });

  describe("a person's own account", () => {
    let personId: string;
    let personSession: string;

    beforeEach(async () => {
      personId = await insertUser({
        firstName: "Margaret Hamilton",
        email: "margaret@example.com",
        roleId: await insertRole("Operadora"),
      });
      personSession = await insertSession(personId);
    });

    it("answers 201 to a person without the reset_user_pin permission, in any letter case", async () => {
      const lower = await emitPinCode(personId, personSession);
      const upper = await emitPinCode(personId.toUpperCase(), personSession);

      expect(lower.statusCode).toBe(201);
      expect(upper.statusCode).toBe(201);
      expect(await codesOf(personId)).toHaveLength(2);
    });

    it("answers 201 to a holder of reset_user_pin who is not an Administrator", async () => {
      const response = await emitPinCode(holderId, holderSession);

      expect(response.statusCode).toBe(201);
      expect((await codesOf(holderId))[0]).toMatchObject({ issuedBy: holderId });
    });

    it("answers 403 forbidden to a person without the permission aiming at another user, emitting nothing", async () => {
      const other = await emitPinCode(targetId, personSession);
      const missing = await emitPinCode(MISSING_ID, personSession);
      const administrator = await emitPinCode(administratorId, personSession);

      for (const response of [other, missing, administrator]) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ code: "forbidden" });
      }
      expect(await codesOf(targetId)).toHaveLength(0);
      expect(await codesOf(administratorId)).toHaveLength(0);
    });

    it("returns 401 authorization_required when the authorization is stale, emitting nothing", async () => {
      const stale = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const staleSession = await insertSession(personId, stale);

      const response = await emitPinCode(personId, staleSession);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      expect(await codesOf(personId)).toHaveLength(0);
    });
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required when the authorization is older than 5 minutes, emitting nothing", async () => {
      const stale = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const staleSession = await insertSession(holderId, stale);

      const response = await emitPinCode(targetId, staleSession);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      expect(await codesOf(targetId)).toHaveLength(0);
    });

    it("returns 401 authorization_required, not 404, for a missing target when the authorization is stale", async () => {
      const stale = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const staleSession = await insertSession(holderId, stale);

      const response = await emitPinCode("00000000-0000-0000-0000-000000000000", staleSession);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
    });

    it("returns 401 authorization_required, not 404, for an Administrator target the holder may not emit for when the authorization is stale", async () => {
      const stale = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const staleSession = await insertSession(holderId, stale);

      const response = await emitPinCode(administratorId, staleSession);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      expect(await codesOf(administratorId)).toHaveLength(0);
    });
  });

  describe("emitting a code", () => {
    it("answers 201 with a 16-character base32 code that expires 15 minutes after emission", async () => {
      const response = await emitPinCode(targetId, holderSession);

      expect(response.statusCode).toBe(201);
      const body = userPinCodeSchema.parse(response.json());
      expect(body.expires_at).toBe("2026-01-05T12:15:00.000Z");
    });

    it("emits a different code every time", async () => {
      const first = await emitPinCode(targetId, holderSession);
      const second = await emitPinCode(targetId, holderSession);

      expect(first.json().code).not.toBe(second.json().code);
    });

    it("stores the hash of the code, issued by the actor, never the code itself", async () => {
      const response = await emitPinCode(targetId, holderSession);

      const [stored] = await codesOf(targetId);
      const { code } = userPinCodeSchema.parse(response.json());
      expect(stored).toMatchObject({
        userId: targetId,
        codeHash: hashSecretCode(code),
        issuedBy: holderId,
        issuedAt: NOON,
        expiresAt: new Date("2026-01-05T12:15:00.000Z"),
        failedAttempts: 0,
        redeemedAt: null,
        supersededAt: null,
      });
      expect(JSON.stringify(stored)).not.toContain(code);
    });

    it("removes the user's current PIN, keeping every other user's", async () => {
      await db.insert(userPins).values([
        { userId: targetId, salt: "salt", hash: "hash", setAt: NOON },
        { userId: holderId, salt: "salt", hash: "hash", setAt: NOON },
      ]);

      await emitPinCode(targetId, holderSession);

      const remaining = await db.select().from(userPins);
      expect(remaining.map((pin) => pin.userId)).toEqual([holderId]);
    });

    it("bumps the version of a user whose PIN was removed and logs it as an update in their branch", async () => {
      await db
        .insert(userPins)
        .values({ userId: targetId, salt: "salt", hash: "hash", setAt: NOON });
      const mark = await lastLoggedChangeSeq(db);

      await emitPinCode(targetId, holderSession);

      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      expect(target?.version).toBe(2);
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

    it("leaves the version alone and logs nothing for a user who had no PIN", async () => {
      const mark = await lastLoggedChangeSeq(db);

      await emitPinCode(targetId, holderSession);

      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      expect(target?.version).toBe(1);
      expect(await changesLoggedAfter(db, mark)).toEqual([]);
    });

    it("supersedes the user's earlier live code, leaving the new one live", async () => {
      await insertEarlierCode(targetId, new Date(NOON.getTime() - 5 * 60 * 1000));

      await emitPinCode(targetId, holderSession);

      const codes = await codesOf(targetId);
      const superseded = codes.filter((row) => row.supersededAt !== null);
      const live = codes.filter((row) => row.supersededAt === null);
      expect(superseded).toHaveLength(1);
      expect(superseded[0]?.supersededAt).toEqual(NOON);
      expect(live).toHaveLength(1);
      expect(live[0]?.issuedAt).toEqual(NOON);
    });

    it("leaves an already redeemed code as it was", async () => {
      const issuedAt = new Date(NOON.getTime() - 20 * 60 * 1000);
      await insertEarlierCode(targetId, issuedAt);
      await db
        .update(userPinCodes)
        .set({ redeemedAt: issuedAt })
        .where(eq(userPinCodes.userId, targetId));

      await emitPinCode(targetId, holderSession);

      const [redeemed] = await db
        .select()
        .from(userPinCodes)
        .where(and(eq(userPinCodes.userId, targetId), eq(userPinCodes.issuedAt, issuedAt)));
      expect(redeemed?.supersededAt).toBeNull();
    });

    it("writes an audit row naming the actor and the user, without the code or its hash", async () => {
      const response = await emitPinCode(targetId, holderSession);

      const { code } = userPinCodeSchema.parse(response.json());
      const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
      expect(audited).toHaveLength(1);
      expect(audited[0]).toMatchObject({
        entity: "user",
        actorId: holderId,
        previousValue: null,
        newValue: { pin_code_expires_at: "2026-01-05T12:15:00.000Z" },
        at: currentTime,
      });
      expect(JSON.stringify(audited)).not.toContain(code);
      expect(JSON.stringify(audited)).not.toContain(hashSecretCode(code));
    });

    it("emits for a user who has just been created and has no PIN", async () => {
      const response = await emitPinCode(targetId, holderSession);

      expect(response.statusCode).toBe(201);
      expect(await db.select().from(userPins)).toHaveLength(0);
    });
  });

  describe("an Administrator", () => {
    let administratorSession: string;

    beforeEach(async () => {
      administratorSession = await insertSession(administratorId);
    });

    it("emits for their own account", async () => {
      const response = await emitPinCode(administratorId, administratorSession);

      expect(response.statusCode).toBe(201);
      expect(await codesOf(administratorId)).toHaveLength(1);
    });

    it("emits for another Administrator", async () => {
      const otherAdministratorId = await insertUser({
        firstName: "Zoe Admin",
        email: "zoe@example.com",
        roleId: await seededAdministratorRoleId(),
      });

      const response = await emitPinCode(otherAdministratorId, administratorSession);

      expect(response.statusCode).toBe(201);
      expect(await codesOf(otherAdministratorId)).toHaveLength(1);
    });
  });

  it("answers 409 user_inactive for an inactive target, emitting nothing", async () => {
    const inactiveId = await insertUser({
      firstName: "Alan Turing",
      email: "alan@example.com",
      roleId: await insertRole("Repositor"),
      active: false,
    });

    const response = await emitPinCode(inactiveId, holderSession);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "user_inactive" });
    expect(await codesOf(inactiveId)).toHaveLength(0);
  });

  describe("the hourly cap", () => {
    it("answers 429 rate_limited with the seconds until the oldest code leaves the hour, on the sixth emission", async () => {
      for (const minutes of [50, 40, 30, 20]) {
        await insertEarlierCode(targetId, new Date(NOON.getTime() - minutes * 60 * 1000));
      }
      const fifth = await emitPinCode(targetId, holderSession);
      expect(fifth.statusCode).toBe(201);

      const sixth = await emitPinCode(targetId, holderSession);

      expect(sixth.statusCode).toBe(429);
      expect(sixth.headers["retry-after"]).toBe(String(10 * 60));
      expect(sixth.json()).toMatchObject({ code: "rate_limited" });
      expect(await codesOf(targetId)).toHaveLength(5);
    });
  });
});
