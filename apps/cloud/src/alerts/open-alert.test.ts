import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alertDeliveries,
  alertEmailDeliveries,
  alerts,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { escalateAlertsTask } from "./alert-escalation-task.js";
import { type OpenAlertInput, openAlert } from "./open-alert.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

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

// A unique index allows only the one Administrator role the migrations seed.
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

const PASSKEY_REGISTERED: OpenAlertInput = {
  kind: "backoffice_passkey_changed",
  scope: "a-user-id",
  detail: { action: "registered", passkeyName: "Teléfono", actorId: "a-user-id", via: "self" },
};

describe("openAlert", () => {
  it("opens the alert and delivers it to each active user who may see it, through the caller's transaction", async () => {
    const administratorId = await insertUser({
      firstName: "Ada",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
    });
    const supervisorId = await insertUser({
      firstName: "Grace",
      email: "grace@example.com",
      roleId: await insertRole({ name: "Supervisor", permissionKeys: ["view_all_alerts"] }),
    });
    await insertUser({
      firstName: "Hedy",
      email: "hedy@example.com",
      roleId: await insertRole({ name: "Repositor" }),
    });
    await insertUser({
      firstName: "Inactiva",
      email: "inactiva@example.com",
      roleId: await insertRole({ name: "Otra supervisora", permissionKeys: ["view_all_alerts"] }),
      active: false,
    });

    const outcome = await db.transaction((tx) =>
      openAlert(tx, PASSKEY_REGISTERED, { now: () => NOON }),
    );

    if (outcome.kind !== "opened") throw new Error("expected the alert to open");
    const [row] = await db.select().from(alerts).where(eq(alerts.id, outcome.alertId));
    expect(row).toMatchObject({ kind: "backoffice_passkey_changed", openedAt: NOON });
    const delivered = await deliveriesOf(outcome.alertId);
    expect(delivered.map((delivery) => delivery.recipientUserId).sort()).toEqual(
      [administratorId, supervisorId].sort(),
    );
  });

  it("opens the alert at the level it is asked to, instead of the level of its kind", async () => {
    const outcome = await db.transaction((tx) =>
      openAlert(tx, PASSKEY_REGISTERED, { now: () => NOON, level: "critical" }),
    );

    if (outcome.kind !== "opened") throw new Error("expected the alert to open");
    const [row] = await db.select().from(alerts).where(eq(alerts.id, outcome.alertId));
    expect(row).toMatchObject({ level: "critical" });
  });

  it("answers already_open for a second trigger while the alert is open, delivering nothing new", async () => {
    await insertUser({
      firstName: "Grace",
      email: "grace@example.com",
      roleId: await insertRole({ name: "Supervisor", permissionKeys: ["view_all_alerts"] }),
    });

    const [first, second] = await db.transaction(async (tx) => [
      await openAlert(tx, PASSKEY_REGISTERED, { now: () => NOON }),
      await openAlert(tx, PASSKEY_REGISTERED, { now: () => new Date(NOON.getTime() + 60_000) }),
    ]);

    if (first?.kind !== "opened") throw new Error("expected the first trigger to open");
    expect(second).toEqual({ kind: "already_open", alertId: first.alertId });
    expect(await db.select().from(alerts)).toHaveLength(1);
    expect(await db.select().from(alertDeliveries)).toHaveLength(1);
  });

  it("records a pending email of the opening for each recipient who opted in, and none for an alert that stays on the board", async () => {
    const optedInId = await insertUser({
      firstName: "Ada",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
    });
    await insertUser({
      firstName: "Grace",
      email: "grace@example.com",
      roleId: await insertRole({ name: "Supervisor", permissionKeys: ["view_all_alerts"] }),
    });
    await db.update(users).set({ alertEmailOptedInAt: NOON }).where(eq(users.id, optedInId));

    const emailed = await db.transaction((tx) =>
      openAlert(tx, PASSKEY_REGISTERED, { now: () => NOON }),
    );
    const onBoardOnly = await db.transaction((tx) =>
      openAlert(
        tx,
        {
          kind: "lots_expiring",
          scope: locationId,
          locationId,
          detail: { lotCount: 2, windowDays: 30 },
        },
        { now: () => NOON },
      ),
    );

    if (emailed.kind !== "opened" || onBoardOnly.kind !== "opened") {
      throw new Error("expected both alerts to open");
    }
    expect(await db.select().from(alertEmailDeliveries)).toMatchObject([
      {
        alertId: emailed.alertId,
        recipientUserId: optedInId,
        stage: "opened",
        level: "warning",
        occurredAt: NOON,
        status: "pending",
      },
    ]);
  });

  it("records a pending email of the escalation, besides the one of the opening, once the alert escalates", async () => {
    const optedInId = await insertUser({
      firstName: "Ada",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
    });
    await db.update(users).set({ alertEmailOptedInAt: NOON }).where(eq(users.id, optedInId));
    await db.transaction((tx) => openAlert(tx, PASSKEY_REGISTERED, { now: () => NOON }));
    const escalatedAt = new Date(NOON.getTime() + 25 * 60 * 60 * 1000);

    await escalateAlertsTask(db, { now: () => escalatedAt });

    const emails = await db.select().from(alertEmailDeliveries);
    expect(emails.map(({ stage, level, occurredAt }) => [stage, level, occurredAt]).sort()).toEqual(
      [
        ["escalated", "critical", escalatedAt],
        ["opened", "warning", NOON],
      ].sort(),
    );
  });
});
