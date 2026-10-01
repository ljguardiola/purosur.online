import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openAlert } from "../alerts/open-alert.js";
import {
  alerts,
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
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { editRole } from "./role-edit-route.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { createUser } from "./user-creation-route.js";
import { registerUserEditRoutes } from "./user-edit-route.js";

// PGlite serializes every transaction, so an assignment and a role edit can only interleave, and
// the alert can only be made to fail inside the change's own transaction, on a real Postgres.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let admin: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;
let administratorId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("access_increase_alert");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(async () => {
  app = Fastify();
  registerUserEditRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  administratorId = await insertUser(administratorRole.id);
});

afterEach(async () => {
  await app.close();
});

async function insertRole(permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: `Rol ${randomUUID()}`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  await db
    .insert(rolePermissions)
    .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  return role.id;
}

async function insertUser(roleId: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Grace Hopper",
      email: `${randomUUID()}@example.com`,
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

async function assignRole(userId: string, roleId: string) {
  const rawSessionId = generateSessionId();
  const now = new Date();
  await db.insert(sessions).values({
    userId: administratorId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: now,
    lastSeenAt: now,
    passkeyAuthorizedAt: now,
  });
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return app.inject({
    method: "PUT",
    url: `/users/${userId}`,
    headers: { origin: BACKOFFICE_ORIGIN, cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
    payload: { email: user?.email, role_id: roleId, version: 1 },
  });
}

function accessIncreasedAlertsFor(userId: string) {
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.kind, "user_access_increased"), eq(alerts.scope, userId)));
}

async function roleOf(userId: string): Promise<string | undefined> {
  const [row] = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  return row?.roleId;
}

describe("assigning a role while that role's permissions change, on a real Postgres", () => {
  it("opens the alert when a permission is added to the role while the person is being assigned it", async () => {
    const previousRoleId = await insertRole(["sell_and_charge", "void_sale"]);
    const assignedRoleId = await insertRole(["sell_and_charge"]);
    const userId = await insertUser(previousRoleId);

    const holder = await sql.reserve();
    let assignment: ReturnType<typeof assignRole> | undefined;
    try {
      await holder`begin`;
      await holder`select id from roles where id = ${assignedRoleId} for update`;
      assignment = assignRole(userId, assignedRoleId);
      await waitForLockWaiters(sql, 1);
      await holder`insert into role_permissions (role_id, permission_key) values (${assignedRoleId}, 'adjust_stock')`;
      await holder`commit`;
    } finally {
      holder.release();
    }

    const response = await assignment;
    expect(response.statusCode).toBe(200);
    const opened = await accessIncreasedAlertsFor(userId);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ level: "critical", audience: "all" });
  });

  it("opens the alert for a person assigned the role while a permission is being added to it", async () => {
    const previousRoleId = await insertRole(["sell_and_charge", "void_sale"]);
    const editedRoleId = await insertRole(["sell_and_charge"]);
    const userId = await insertUser(previousRoleId);

    const holder = await sql.reserve();
    let edit: ReturnType<typeof editRole> | undefined;
    try {
      await holder`begin`;
      await holder`select id from roles where id = ${editedRoleId} for share`;
      edit = editRole(
        db,
        {
          id: editedRoleId,
          name: `Rol ${randomUUID()}`,
          permissionKeys: ["sell_and_charge", "adjust_stock"],
          version: 1,
          actorId: administratorId,
        },
        { now: () => new Date() },
      );
      await waitForLockWaiters(sql, 1);
      await holder`update user_roles set role_id = ${editedRoleId} where user_id = ${userId}`;
      await holder`commit`;
    } finally {
      holder.release();
    }

    expect(await edit).toMatchObject({ kind: "applied" });
    const opened = await accessIncreasedAlertsFor(userId);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      detail: { cause: "role_permissions_added", addedPermissionKeys: ["adjust_stock"] },
    });
  });
});

describe("assigning a role while that role's edit writes rows naming the person, on a real Postgres", () => {
  it("waits for the role edit instead of deadlocking with it", async () => {
    const previousRoleId = await insertRole(["sell_and_charge"]);
    const editedRoleId = await insertRole(["sell_and_charge"]);
    const userId = await insertUser(previousRoleId);

    const holder = await sql.reserve();
    let assignment: ReturnType<typeof assignRole> | undefined;
    try {
      await holder`begin`;
      await holder`select id from roles where id = ${editedRoleId} for update`;
      assignment = assignRole(userId, editedRoleId);
      await waitForLockWaiters(sql, 1);
      await holder`insert into audit_log (entity, entity_id, actor_id, previous_value, new_value)
        values ('role', ${editedRoleId}, ${userId}, '{}', '{}')`;
      await holder`commit`;
    } finally {
      holder.release();
    }

    const response = await assignment;
    expect(response.statusCode).toBe(200);
    expect(await roleOf(userId)).toBe(editedRoleId);
  });
});

describe("two increases of the same person's access at once, on a real Postgres", () => {
  it("opens both alerts without either waiting for the other", async () => {
    const userId = await insertUser(await insertRole(["sell_and_charge"]));
    const increase = (roleName: string) => ({
      kind: "user_access_increased" as const,
      scope: userId,
      detail: {
        cause: "role_permissions_added" as const,
        roleName,
        addedPermissionKeys: ["view_all_alerts"],
        actorId: userId,
      },
    });

    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstOpened: () => void = () => {};
    const opened = new Promise<void>((resolve) => {
      firstOpened = resolve;
    });
    const first = db.transaction(async (tx) => {
      const outcome = await openAlert(tx, increase("first"), { now: () => new Date() });
      firstOpened();
      await released;
      return outcome;
    });
    try {
      await Promise.race([opened, first]);
      const second = await db.transaction((tx) =>
        openAlert(tx, increase("second"), { now: () => new Date() }),
      );
      expect(second.kind).toBe("opened");
    } finally {
      release();
    }

    expect((await first).kind).toBe("opened");
    const alertsForUser = await accessIncreasedAlertsFor(userId);
    expect(alertsForUser.map((alert) => alert.detail["roleName"]).sort()).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("an alert for increased access that fails to open, on a real Postgres", () => {
  beforeAll(async () => {
    await admin.unsafe(`
      create function refuse_access_increased_alert() returns trigger language plpgsql as $$
      begin
        raise exception 'alert refused by the test';
      end $$;
      create trigger refuse_access_increased_alert before insert on alerts
        for each row when (new.kind = 'user_access_increased')
        execute function refuse_access_increased_alert();
    `);
  });

  afterAll(async () => {
    await admin.unsafe(`
      drop trigger refuse_access_increased_alert on alerts;
      drop function refuse_access_increased_alert();
    `);
  });

  it("leaves the person's role, version and audit trail as they were", async () => {
    const previousRoleId = await insertRole(["sell_and_charge"]);
    const assignedRoleId = await insertRole(["sell_and_charge", "adjust_stock"]);
    const userId = await insertUser(previousRoleId);

    const response = await assignRole(userId, assignedRoleId);

    expect(response.statusCode).toBe(500);
    expect(await roleOf(userId)).toBe(previousRoleId);
    const [user] = await db
      .select({ version: users.version })
      .from(users)
      .where(eq(users.id, userId));
    expect(user?.version).toBe(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, userId))).toHaveLength(0);
  });

  it("creates no user as Administrator, nor its audit row", async () => {
    const [administratorRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));
    if (!administratorRole) {
      throw new Error("test setup: no Administrator role seeded");
    }
    const email = `${randomUUID()}@example.com`;

    await expect(
      createUser(
        db,
        {
          firstName: "Katherine Johnson",
          email,
          roleId: administratorRole.id,
          locationId: await seededLocationId(db),
          actorId: administratorId,
        },
        { now: () => new Date() },
      ),
    ).rejects.toThrow(/insert into "alerts"/);

    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    const audited = await db
      .select({ newValue: auditLog.newValue })
      .from(auditLog)
      .where(eq(auditLog.actorId, administratorId));
    expect(audited.filter((row) => JSON.stringify(row.newValue).includes(email))).toHaveLength(0);
  });

  it("leaves the role's permissions, version and audit trail as they were", async () => {
    const roleId = await insertRole(["sell_and_charge"]);
    await insertUser(roleId);

    await expect(
      editRole(
        db,
        {
          id: roleId,
          name: `Rol ${randomUUID()}`,
          permissionKeys: ["sell_and_charge", "adjust_stock"],
          version: 1,
          actorId: administratorId,
        },
        { now: () => new Date() },
      ),
    ).rejects.toThrow(/insert into "alerts"/);

    const permissions = await db
      .select({ permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    expect(permissions).toEqual([{ permissionKey: "sell_and_charge" }]);
    const [role] = await db
      .select({ version: roles.version })
      .from(roles)
      .where(eq(roles.id, roleId));
    expect(role?.version).toBe(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, roleId))).toHaveLength(0);
  });
});
