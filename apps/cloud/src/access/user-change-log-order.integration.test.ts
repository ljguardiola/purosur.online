import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rolePermissions, roles, userRoles, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { editRole } from "./role-edit-route.js";
import { deactivateUser } from "./user-deactivation-route.js";

const UNIQUE_VIOLATION = "23505";

// PGlite serializes every query on one connection, so where a lock is taken can only be observed
// against a real Postgres pool.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("user_change_log_order");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function insertUser(roleId: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Grace",
      email: `grace-${randomUUID()}@example.com`,
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

async function insertRole(name: string): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  return role.id;
}

async function holdingTheChangeLog<TOutcome>(
  start: () => Promise<TOutcome>,
  whileWaiting: () => Promise<unknown>,
): Promise<{ started: TOutcome; concurrent: unknown }> {
  const holder = await sql.reserve();
  await holder`begin`;
  await holder`select pg_advisory_xact_lock(hashtextextended('changes_log', 0))`;
  const started = start();
  let concurrent: Promise<unknown> = Promise.resolve();
  try {
    await waitForLockWaiters(sql, 1);
    concurrent = whileWaiting();
    await waitForLockWaiters(sql, 2);
  } finally {
    await holder`rollback`;
    holder.release();
  }
  return { started: await started, concurrent: await concurrent };
}

describe("changing a user or a role while another writer holds the change log, on a real Postgres", () => {
  it("has already written a deactivated user's row when a deactivation starts waiting for the log", async () => {
    const userId = await insertUser(await insertRole(`Cajera ${randomUUID()}`));

    const { started } = await holdingTheChangeLog(
      () => deactivateUser(db, { id: userId, actorId: userId, at: new Date() }),
      () => sql`update users set first_name = 'Otra' where id = ${userId}`.then(() => undefined),
    );

    expect(started).toEqual({ kind: "deactivated" });
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row).toMatchObject({ firstName: "Otra", active: false, version: 2 });
  });

  it("has already written an edited role's permissions when an edit starts waiting for the log", async () => {
    const roleId = await insertRole(`Cajera ${randomUUID()}`);
    const actorId = await insertUser(roleId);

    const { started, concurrent } = await holdingTheChangeLog(
      () =>
        editRole(
          db,
          {
            id: roleId,
            name: "Cajera senior",
            permissionKeys: ["adjust_stock"],
            version: 1,
            actorId,
          },
          { now: () => new Date() },
        ),
      () =>
        sql`insert into role_permissions (role_id, permission_key) values (${roleId}, 'adjust_stock')`.then(
          () => undefined,
          (error: { code?: string }) => error.code,
        ),
    );

    expect(started).toMatchObject({ kind: "applied" });
    expect(concurrent).toBe(UNIQUE_VIOLATION);
    const stored = await db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    expect(stored).toEqual([{ key: "adjust_stock" }]);
  });
});
