import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { alertDeliveries, alerts, rolePermissions, roles, userRoles, users } from "../db/schema.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { type OpenAlertInput, openAlert } from "./open-alert.js";

describe("a passkey-change alert's detail", () => {
  it("accepts a self-service registration or removal", () => {
    expectTypeOf<{
      kind: "backoffice_passkey_changed";
      scope: string;
      detail: { action: "removed"; passkeyName: string; actorId: string; via: "self" };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts a registration through account recovery", () => {
    expectTypeOf<{
      kind: "backoffice_passkey_changed";
      scope: string;
      detail: { action: "registered"; passkeyName: string; actorId: string; via: "recovery" };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts an Administrator's removal", () => {
    expectTypeOf<{
      kind: "backoffice_passkey_changed";
      scope: string;
      detail: { action: "removed"; passkeyName: string; actorId: string; via: "administrator" };
    }>().toExtend<OpenAlertInput>();
  });

  it("never accepts a removal through account recovery, which only registers", () => {
    expectTypeOf<{
      kind: "backoffice_passkey_changed";
      scope: string;
      detail: { action: "removed"; passkeyName: string; actorId: string; via: "recovery" };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("never accepts an Administrator's registration, since an Administrator only removes", () => {
    expectTypeOf<{
      kind: "backoffice_passkey_changed";
      scope: string;
      detail: {
        action: "registered";
        passkeyName: string;
        actorId: string;
        via: "administrator";
      };
    }>().not.toExtend<OpenAlertInput>();
  });
});

const NOON = new Date("2026-01-05T12:00:00.000Z");
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let locationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  locationId = await seededLocationId(db);
});

/** The migrations seed the one, fixed Administrator role; no test may insert a second one. */
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

async function insertRole(input: { name: string; permissionKeys?: string[] }): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: input.name, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: inserting the role returned no row");
  }
  for (const permissionKey of input.permissionKeys ?? []) {
    await db.insert(rolePermissions).values({ roleId: role.id, permissionKey });
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
      locationId,
      active: input.active ?? true,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

function deliveriesOf(alertId: string) {
  return db.select().from(alertDeliveries).where(eq(alertDeliveries.alertId, alertId));
}

describe("openAlert", () => {
  it("opens a new alert with the kind's level, escalation deadline, audience and detail", async () => {
    const outcome = await db.transaction((tx) =>
      openAlert(
        tx,
        {
          kind: "user_email_changed",
          scope: "a-user-id",
          detail: { previousEmail: "old@example.com", newEmail: "new@example.com" },
        },
        { now: () => NOON },
      ),
    );

    expect(outcome.kind).toBe("opened");
    if (outcome.kind !== "opened") throw new Error("unreachable");
    const [row] = await db.select().from(alerts).where(eq(alerts.id, outcome.alertId));
    expect(row).toMatchObject({
      kind: "user_email_changed",
      scope: "a-user-id",
      level: "warning",
      audience: "all",
      locationId: null,
      detail: { previousEmail: "old@example.com", newEmail: "new@example.com" },
      escalateAt: new Date(NOON.getTime() + TWENTY_FOUR_HOURS_MS),
      escalatedAt: null,
      resolvedAt: null,
    });
  });

  it("writes one delivery row per active user who can see an All-audience alert: administrators and view_all_alerts holders", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    const viewAllRoleId = await insertRole({
      name: "Supervisor",
      permissionKeys: ["view_all_alerts"],
    });
    const viewLocalRoleId = await insertRole({
      name: "Cajera",
      permissionKeys: ["view_branch_alerts"],
    });
    const noViewRoleId = await insertRole({ name: "Sin permiso", permissionKeys: [] });
    const administratorId = await insertUser({
      firstName: "Ada",
      email: "ada@example.com",
      roleId: administratorRoleId,
    });
    const supervisorId = await insertUser({
      firstName: "Grace",
      email: "grace@example.com",
      roleId: viewAllRoleId,
    });
    await insertUser({ firstName: "Local", email: "local@example.com", roleId: viewLocalRoleId });
    await insertUser({ firstName: "Nadie", email: "nadie@example.com", roleId: noViewRoleId });
    await insertUser({
      firstName: "Inactiva",
      email: "inactiva@example.com",
      roleId: viewAllRoleId,
      active: false,
    });

    const outcome = await db.transaction((tx) =>
      openAlert(
        tx,
        {
          kind: "backoffice_passkey_changed",
          scope: administratorId,
          detail: {
            action: "registered",
            passkeyName: "Teléfono",
            actorId: administratorId,
            via: "self",
          },
        },
        { now: () => NOON },
      ),
    );

    expect(outcome.kind).toBe("opened");
    if (outcome.kind !== "opened") throw new Error("unreachable");
    const delivered = await deliveriesOf(outcome.alertId);
    expect(delivered.map((row) => row.recipientUserId).sort()).toEqual(
      [administratorId, supervisorId].sort(),
    );
    for (const row of delivered) {
      expect(row.channel).toBe("backoffice");
      expect(row.status).toBe("sent");
    }
  });

  it("is idempotent under dedup: a second trigger while the alert is open opens nothing and delivers nothing new", async () => {
    const roleId = await insertRole({ name: "Supervisor", permissionKeys: ["view_all_alerts"] });
    await insertUser({ firstName: "Grace", email: "grace@example.com", roleId });

    const first = await db.transaction((tx) =>
      openAlert(
        tx,
        { kind: "backoffice_sign_in_lockout", scope: "203.0.113.5", detail: { attempts: 5 } },
        { now: () => NOON },
      ),
    );
    const second = await db.transaction((tx) =>
      openAlert(
        tx,
        { kind: "backoffice_sign_in_lockout", scope: "203.0.113.5", detail: { attempts: 8 } },
        { now: () => new Date(NOON.getTime() + 60_000) },
      ),
    );

    expect(first.kind).toBe("opened");
    expect(second).toEqual({
      kind: "already_open",
      alertId: (first as { alertId: string }).alertId,
    });
    const allOpenAlerts = await db
      .select()
      .from(alerts)
      .where(eq(alerts.kind, "backoffice_sign_in_lockout"));
    expect(allOpenAlerts).toHaveLength(1);
    const delivered = await deliveriesOf((first as { alertId: string }).alertId);
    expect(delivered).toHaveLength(1);
  });

  it("opens a fresh alert once the earlier one of the same kind and scope is resolved", async () => {
    const roleId = await insertRole({ name: "Supervisor", permissionKeys: ["view_all_alerts"] });
    await insertUser({ firstName: "Grace", email: "grace@example.com", roleId });

    const first = await db.transaction((tx) =>
      openAlert(
        tx,
        { kind: "backoffice_recovery_requested", scope: "a-user-id", detail: {} },
        { now: () => NOON },
      ),
    );
    if (first.kind !== "opened") throw new Error("unreachable");
    await db.update(alerts).set({ resolvedAt: NOON }).where(eq(alerts.id, first.alertId));

    const second = await db.transaction((tx) =>
      openAlert(
        tx,
        { kind: "backoffice_recovery_requested", scope: "a-user-id", detail: {} },
        { now: () => new Date(NOON.getTime() + 60_000) },
      ),
    );

    expect(second.kind).toBe("opened");
    expect((second as { alertId: string }).alertId).not.toBe(first.alertId);
  });
});
