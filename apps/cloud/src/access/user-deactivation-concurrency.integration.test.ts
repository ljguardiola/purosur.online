import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  countLockWaiters,
  runQueuedBehindHeldLock,
  waitForLockWaiters,
} from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerUserDeactivationRoutes } from "./user-deactivation-route.js";
import { registerUserEditRoutes } from "./user-edit-route.js";

// PGlite serializes every transaction, so racing requests can only interleave on a real Postgres
// pool; these tests pin the order by holding the target's row lock until both requests are waiting.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("user_deactivation_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerUserDeactivationRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
  registerUserEditRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
});

afterEach(async () => {
  await app.close();
});

async function seededAdministratorRoleId(): Promise<string> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!role) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return role.id;
}

async function insertCashierRole(): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: `Cajera ${randomUUID()}`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  return role.id;
}

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

async function targetState(targetId: string) {
  const [row] = await db
    .select({ active: users.active, roleId: userRoles.roleId })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(users.id, targetId));
  return row;
}

describe("deactivating the same target twice at once on a real Postgres", () => {
  it("lets exactly one deactivation succeed, answers the other not_found, and audits it once", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    const targetId = await insertUser(
      `target-${randomUUID()}@example.com`,
      await insertCashierRole(),
    );
    const actorId = await insertUser(`actor-${randomUUID()}@example.com`, administratorRoleId);
    const cookie = `${SESSION_COOKIE_NAME}=${await insertSession(actorId)}`;

    const deactivate = () =>
      app.inject({
        method: "PUT",
        url: `/users/${targetId}/deactivation`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
      });

    const [firstResponse, secondResponse] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from users where id = ${targetId} for update`,
      deactivate,
      deactivate,
    );

    const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].sort();
    expect(statusCodes).toEqual([200, 404]);
    const refused = [firstResponse, secondResponse].find((response) => response.statusCode === 404);
    expect(refused?.json()).toMatchObject({ code: "not_found" });

    const [row] = await db
      .select({ active: users.active, version: users.version })
      .from(users)
      .where(eq(users.id, targetId));
    expect(row?.active).toBe(false);
    expect(row?.version).toBe(2);

    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(1);
  });
});

describe("deactivating a target while it is promoted to Administrator on a real Postgres", () => {
  async function raceDeactivationAgainstPromotion(first: "promotion" | "deactivation") {
    const administratorRoleId = await seededAdministratorRoleId();
    const cashierRoleId = await insertCashierRole();
    const targetEmail = `target-${randomUUID()}@example.com`;
    const targetId = await insertUser(targetEmail, cashierRoleId);
    const actorId = await insertUser(`actor-${randomUUID()}@example.com`, administratorRoleId);
    const cookie = `${SESSION_COOKIE_NAME}=${await insertSession(actorId)}`;

    const promote = () =>
      app.inject({
        method: "PUT",
        url: `/users/${targetId}`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
        payload: { email: targetEmail, role_id: administratorRoleId, version: 1 },
      });
    const deactivate = () =>
      app.inject({
        method: "PUT",
        url: `/users/${targetId}/deactivation`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
      });

    const holdTargetRowLock = (holder: postgres.ReservedSql) =>
      holder`select id from users where id = ${targetId} for update`;
    if (first === "promotion") {
      const [promotion, deactivation] = await runQueuedBehindHeldLock(
        sql,
        holdTargetRowLock,
        promote,
        deactivate,
      );
      return { promotion, deactivation, targetId, administratorRoleId, cashierRoleId };
    }
    const [deactivation, promotion] = await runQueuedBehindHeldLock(
      sql,
      holdTargetRowLock,
      deactivate,
      promote,
    );
    return { promotion, deactivation, targetId, administratorRoleId, cashierRoleId };
  }

  it("answers the deactivation not_found when the promotion commits first", async () => {
    const { promotion, deactivation, targetId, administratorRoleId } =
      await raceDeactivationAgainstPromotion("promotion");

    expect(promotion.statusCode).toBe(200);
    expect(deactivation.statusCode).toBe(404);
    expect(deactivation.json()).toMatchObject({ code: "not_found" });
    expect(await targetState(targetId)).toEqual({ active: true, roleId: administratorRoleId });
  });

  it("refuses the promotion as stale when the deactivation commits first", async () => {
    const { promotion, deactivation, targetId, cashierRoleId } =
      await raceDeactivationAgainstPromotion("deactivation");

    expect(deactivation.statusCode).toBe(200);
    expect(promotion.statusCode).toBe(409);
    expect(promotion.json()).toMatchObject({ code: "stale_version" });
    expect(await targetState(targetId)).toEqual({ active: false, roleId: cashierRoleId });
  });
});

describe("deactivating two different targets at once on a real Postgres", () => {
  async function queuesBehindALock(pending: Promise<unknown>): Promise<boolean> {
    let settled = false;
    const markSettled = () => {
      settled = true;
    };
    const settling = pending.then(markSettled, markSettled);
    while (!settled) {
      if ((await countLockWaiters(sql)) >= 2) return true;
      await Promise.race([settling, new Promise((resolve) => setTimeout(resolve, 10))]);
    }
    return false;
  }

  it("deactivates one target while another target's deactivation is still waiting", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    const cashierRoleId = await insertCashierRole();
    const waitingTargetId = await insertUser(`waiting-${randomUUID()}@example.com`, cashierRoleId);
    const otherTargetId = await insertUser(`other-${randomUUID()}@example.com`, cashierRoleId);
    const actorId = await insertUser(`actor-${randomUUID()}@example.com`, administratorRoleId);
    const cookie = `${SESSION_COOKIE_NAME}=${await insertSession(actorId)}`;

    const deactivate = (targetId: string) =>
      app.inject({
        method: "PUT",
        url: `/users/${targetId}/deactivation`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
      });

    const holder = await sql.reserve();
    let waitingDeactivation: Promise<unknown> = Promise.resolve();
    let otherDeactivation: ReturnType<typeof deactivate> | undefined;
    let otherQueued: boolean;
    try {
      await holder`begin`;
      await holder`select id from users where id = ${waitingTargetId} for update`;
      waitingDeactivation = deactivate(waitingTargetId);
      await waitForLockWaiters(sql, 1);
      otherDeactivation = deactivate(otherTargetId);
      otherQueued = await queuesBehindALock(otherDeactivation);
    } finally {
      await holder`rollback`;
      holder.release();
      await Promise.allSettled([waitingDeactivation, otherDeactivation]);
    }

    expect(otherQueued).toBe(false);
    expect((await otherDeactivation).statusCode).toBe(200);
    expect(await targetState(otherTargetId)).toEqual({ active: false, roleId: cashierRoleId });
  });
});

describe("two users deactivating each other at once on a real Postgres", () => {
  it("deactivates both users", async () => {
    const managerRoleId = await insertCashierRole();
    await db
      .insert(rolePermissions)
      .values({ roleId: managerRoleId, permissionKey: "deactivate_users" });
    const firstId = await insertUser(`first-${randomUUID()}@example.com`, managerRoleId);
    const secondId = await insertUser(`second-${randomUUID()}@example.com`, managerRoleId);
    const firstCookie = `${SESSION_COOKIE_NAME}=${await insertSession(firstId)}`;
    const secondCookie = `${SESSION_COOKIE_NAME}=${await insertSession(secondId)}`;
    const deactivate = (targetId: string, cookie: string) => () =>
      app.inject({
        method: "PUT",
        url: `/users/${targetId}/deactivation`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
      });

    const [firstDeactivation, secondDeactivation] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from users where id in ${sql([firstId, secondId])} for update`,
      deactivate(secondId, firstCookie),
      deactivate(firstId, secondCookie),
    );

    expect(firstDeactivation.statusCode).toBe(200);
    expect(secondDeactivation.statusCode).toBe(200);
    expect((await targetState(firstId))?.active).toBe(false);
    expect((await targetState(secondId))?.active).toBe(false);
  });
});
