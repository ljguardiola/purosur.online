import { AlertAlreadyOpenError, type NewAlert } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  alertDeliveries,
  alerts,
  auditLog,
  locations,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function newAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    kind: "user_email_changed",
    scope: "user-1",
    level: "warning",
    audience: "all",
    locationId: null,
    detail: { previousEmail: "a@example.com", newEmail: "b@example.com", actorId: "actor-1" },
    openedAt: NOON,
    escalateAt: new Date(NOON.getTime() + 60_000),
    deduplicates: true,
    ...overrides,
  };
}

async function insertRole(name: string, permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: inserting the role returned no row");
  }
  for (const permissionKey of permissionKeys) {
    await db.insert(rolePermissions).values({ roleId: role.id, permissionKey });
  }
  return role.id;
}

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

async function insertUser(
  name: string,
  roleId: string,
  options: { active?: boolean; locationId?: string } = {},
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: name,
      email: `${name.toLowerCase()}@example.com`,
      locationId: options.locationId ?? (await seededLocationId(db)),
      active: options.active ?? true,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

describe("DrizzleAlertStore insertAlert", () => {
  it("stores the alert as given and answers its id", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);

    const id = await store.transaction((tx) => tx.insertAlert(newAlert()));

    const [row] = await db.select().from(alerts).where(eq(alerts.id, id));
    expect(row).toMatchObject({
      kind: "user_email_changed",
      scope: "user-1",
      level: "warning",
      audience: "all",
      locationId: null,
      detail: { previousEmail: "a@example.com", newEmail: "b@example.com", actorId: "actor-1" },
      openedAt: NOON,
      escalateAt: new Date(NOON.getTime() + 60_000),
      escalatedAt: null,
      resolvedAt: null,
      deduplicates: true,
    });
  });

  it("refuses a second open alert of a deduplicating kind and scope with AlertAlreadyOpenError", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    await store.transaction((tx) => tx.insertAlert(newAlert()));

    await expect(store.transaction((tx) => tx.insertAlert(newAlert()))).rejects.toBeInstanceOf(
      AlertAlreadyOpenError,
    );
  });

  it("names the kind and scope of the open alert it refused to duplicate", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    await store.transaction((tx) => tx.insertAlert(newAlert()));

    await expect(store.transaction((tx) => tx.insertAlert(newAlert()))).rejects.toMatchObject({
      kind: "user_email_changed",
      scope: "user-1",
    });
  });

  it("accepts an alert of the same kind and scope once the earlier one is closed", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const first = await store.transaction((tx) => tx.insertAlert(newAlert()));
    await db.update(alerts).set({ resolvedAt: NOON }).where(eq(alerts.id, first));

    const second = await store.transaction((tx) => tx.insertAlert(newAlert()));

    expect(second).not.toBe(first);
  });

  it("accepts a second open alert of a kind that does not deduplicate", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const alert = newAlert({ kind: "user_access_increased", deduplicates: false });

    await store.transaction((tx) => tx.insertAlert(alert));
    await store.transaction((tx) => tx.insertAlert(alert));

    expect(await db.select().from(alerts)).toHaveLength(2);
  });

  it("rethrows a failure that is not the open-alert uniqueness", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);

    await expect(
      store.transaction((tx) => tx.insertAlert(newAlert({ audience: "local", locationId: null }))),
    ).rejects.not.toBeInstanceOf(AlertAlreadyOpenError);
  });

  it("keeps its own transaction usable after a refused duplicate, so it can still find the open alert", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const first = await store.transaction((tx) => tx.insertAlert(newAlert()));

    const found = await store.transaction(async (tx) => {
      await expect(tx.insertAlert(newAlert())).rejects.toBeInstanceOf(AlertAlreadyOpenError);
      return tx.findOpenAlertId("user_email_changed", "user-1");
    });

    expect(found).toBe(first);
  });

  it("keeps the caller's transaction usable after a refused duplicate, so its other writes commit", async () => {
    await new DrizzleAlertStore(db, () => NOON).transaction((tx) => tx.insertAlert(newAlert()));

    await db.transaction(async (callerTx) => {
      const store = new DrizzleAlertStore(callerTx, () => NOON);
      await expect(store.transaction((tx) => tx.insertAlert(newAlert()))).rejects.toBeInstanceOf(
        AlertAlreadyOpenError,
      );
      await store.transaction((tx) => tx.insertAlert(newAlert({ scope: "user-2" })));
    });

    const scopes = (await db.select({ scope: alerts.scope }).from(alerts)).map((r) => r.scope);
    expect(scopes.sort()).toEqual(["user-1", "user-2"]);
  });
});

describe("DrizzleAlertStore findOpenAlertId", () => {
  it("answers the open alert of that kind and scope", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const id = await store.transaction((tx) => tx.insertAlert(newAlert()));

    const found = await store.transaction((tx) =>
      tx.findOpenAlertId("user_email_changed", "user-1"),
    );

    expect(found).toBe(id);
  });

  it("ignores a closed alert and one of another scope", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const closed = await store.transaction((tx) => tx.insertAlert(newAlert()));
    await db.update(alerts).set({ resolvedAt: NOON }).where(eq(alerts.id, closed));
    await store.transaction((tx) => tx.insertAlert(newAlert({ scope: "user-2" })));

    const found = await store.transaction((tx) =>
      tx.findOpenAlertId("user_email_changed", "user-1"),
    );

    expect(found).toBeUndefined();
  });
});

describe("DrizzleAlertStore listActiveAlertViewers", () => {
  it("lists each active user once with their administrator flag, permissions and branch", async () => {
    const otherLocation = await db.insert(locations).values({}).returning({ id: locations.id });
    const otherLocationId = otherLocation[0]?.id;
    if (!otherLocationId) {
      throw new Error("test setup: inserting the location returned no row");
    }
    const administratorId = await insertUser("Ada", await seededAdministratorRoleId());
    const supervisorId = await insertUser(
      "Grace",
      await insertRole("Supervisor", ["view_all_alerts", "view_branch_alerts"]),
      { locationId: otherLocationId },
    );
    const cashierId = await insertUser("Local", await insertRole("Cashier", []));

    const viewers = await new DrizzleAlertStore(db, () => NOON).transaction((tx) =>
      tx.listActiveAlertViewers(),
    );

    const byId = new Map(viewers.map((viewer) => [viewer.userId, viewer]));
    expect(viewers).toHaveLength(3);
    expect(byId.get(administratorId)).toMatchObject({
      isAdministrator: true,
      permissionKeys: [],
      locationId: await seededLocationId(db),
    });
    const supervisor = byId.get(supervisorId);
    expect(supervisor?.isAdministrator).toBe(false);
    expect([...(supervisor?.permissionKeys ?? [])].sort()).toEqual([
      "view_all_alerts",
      "view_branch_alerts",
    ]);
    expect(supervisor?.locationId).toBe(otherLocationId);
    expect(byId.get(cashierId)).toMatchObject({ isAdministrator: false, permissionKeys: [] });
  });

  it("leaves out a deactivated user", async () => {
    const roleId = await insertRole("Viewer", ["view_all_alerts"]);
    await insertUser("Inactive", roleId, { active: false });
    const activeId = await insertUser(
      "Active",
      await insertRole("Other viewer", ["view_all_alerts"]),
    );

    const viewers = await new DrizzleAlertStore(db, () => NOON).transaction((tx) =>
      tx.listActiveAlertViewers(),
    );

    expect(viewers.map((viewer) => viewer.userId)).toEqual([activeId]);
  });
});

describe("DrizzleAlertStore recordBackofficeDeliveries", () => {
  it("writes a sent backoffice delivery for each recipient", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const first = await insertUser("Ada", await seededAdministratorRoleId());
    const second = await insertUser("Grace", await insertRole("Viewer", ["view_all_alerts"]));
    const alertId = await store.transaction((tx) => tx.insertAlert(newAlert()));

    await store.transaction((tx) => tx.recordBackofficeDeliveries(alertId, [first, second]));

    const rows = await db.select().from(alertDeliveries);
    expect(rows.map((row) => row.recipientUserId).sort()).toEqual([first, second].sort());
    expect(rows.every((row) => row.channel === "backoffice" && row.status === "sent")).toBe(true);
    expect(rows.every((row) => row.alertId === alertId)).toBe(true);
  });

  it("stamps each delivery with the clock", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const recipient = await insertUser("Ada", await seededAdministratorRoleId());
    const alertId = await store.transaction((tx) => tx.insertAlert(newAlert()));

    await store.transaction((tx) => tx.recordBackofficeDeliveries(alertId, [recipient]));

    expect(await db.select().from(alertDeliveries)).toMatchObject([{ createdAt: NOON }]);
  });
});

describe("DrizzleAlertStore lockAlert", () => {
  it("answers the alert's kind, level, escalation, scope, detail and resolution", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const alertId = await store.transaction((tx) => tx.insertAlert(newAlert()));
    await db
      .update(alerts)
      .set({ level: "critical", escalatedAt: NOON })
      .where(eq(alerts.id, alertId));

    const locked = await store.transaction((tx) => tx.lockAlert(alertId));

    expect(locked).toEqual({
      kind: "user_email_changed",
      level: "critical",
      escalatedAt: NOON,
      scope: "user-1",
      detail: { previousEmail: "a@example.com", newEmail: "b@example.com", actorId: "actor-1" },
      resolvedAt: null,
    });
  });

  it("answers nothing for an unknown alert", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);

    const locked = await store.transaction((tx) =>
      tx.lockAlert("00000000-0000-4000-8000-000000000000"),
    );

    expect(locked).toBeUndefined();
  });
});

describe("DrizzleAlertStore recordClosure", () => {
  it("closes the alert with the kept scope and detail and audits the closure", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const closerId = await insertUser("Ada", await seededAdministratorRoleId());
    const alertId = await store.transaction((tx) => tx.insertAlert(newAlert()));

    await store.transaction((tx) =>
      tx.recordClosure(alertId, {
        closedAt: NOON,
        closedBy: closerId,
        scope: "hashed-scope",
        detail: { kept: true },
      }),
    );

    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({
      resolvedAt: NOON,
      resolvedBy: closerId,
      scope: "hashed-scope",
      detail: { kept: true },
    });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, alertId));
    expect(audit).toMatchObject({
      entity: "alert",
      actorId: closerId,
      previousValue: { resolvedAt: null },
      newValue: { resolvedAt: NOON.toISOString() },
    });
  });
});

describe("DrizzleAlertStore recordClosure by no person", () => {
  it("closes the alert with no resolver and audits the closure with no actor", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const alertId = await store.transaction((tx) => tx.insertAlert(newAlert()));

    await store.transaction((tx) =>
      tx.recordClosure(alertId, {
        closedAt: NOON,
        closedBy: null,
        scope: "user-1",
        detail: {},
      }),
    );

    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ resolvedAt: NOON, resolvedBy: null });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, alertId));
    expect(audit).toMatchObject({ entity: "alert", actorId: null });
  });
});

describe("DrizzleAlertStore lockOpenAlerts and recordEscalation", () => {
  it("lists only open alerts with their level and escalation time", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const open = await store.transaction((tx) => tx.insertAlert(newAlert()));
    const closed = await store.transaction((tx) => tx.insertAlert(newAlert({ scope: "user-2" })));
    await db.update(alerts).set({ resolvedAt: NOON }).where(eq(alerts.id, closed));

    const locked = await store.transaction((tx) => tx.lockOpenAlerts());

    expect(locked).toEqual([
      {
        alertId: open,
        level: "warning",
        resolvedAt: null,
        escalateAt: new Date(NOON.getTime() + 60_000),
      },
    ]);
  });

  it("escalates the given alerts to the given level, recording when", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const escalated = await store.transaction((tx) => tx.insertAlert(newAlert()));
    const untouched = await store.transaction((tx) =>
      tx.insertAlert(newAlert({ scope: "user-2" })),
    );

    await store.transaction((tx) =>
      tx.recordEscalation([escalated], { level: "critical", escalatedAt: NOON }),
    );

    const [hit] = await db.select().from(alerts).where(eq(alerts.id, escalated));
    const [miss] = await db.select().from(alerts).where(eq(alerts.id, untouched));
    expect(hit).toMatchObject({ level: "critical", escalatedAt: NOON });
    expect(miss).toMatchObject({ level: "warning", escalatedAt: null });
  });
});

describe("DrizzleAlertStore lockOpenAlertOfKey", () => {
  it("answers the open alert of that kind and scope with the moment its condition cleared", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const id = await store.transaction((tx) => tx.insertAlert(newAlert()));
    const clearedAt = new Date(NOON.getTime() - 60_000);
    await db.update(alerts).set({ conditionClearedAt: clearedAt }).where(eq(alerts.id, id));

    const locked = await store.transaction((tx) =>
      tx.lockOpenAlertOfKey("user_email_changed", "user-1"),
    );

    expect(locked).toEqual({ alertId: id, conditionClearedAt: clearedAt });
  });

  it("answers no moment for an alert whose condition has not cleared", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const id = await store.transaction((tx) => tx.insertAlert(newAlert()));

    const locked = await store.transaction((tx) =>
      tx.lockOpenAlertOfKey("user_email_changed", "user-1"),
    );

    expect(locked).toEqual({ alertId: id, conditionClearedAt: null });
  });

  it("ignores a closed alert and one of another scope or kind", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const closed = await store.transaction((tx) => tx.insertAlert(newAlert()));
    await db.update(alerts).set({ resolvedAt: NOON }).where(eq(alerts.id, closed));
    await store.transaction((tx) => tx.insertAlert(newAlert({ scope: "user-2" })));
    await store.transaction((tx) =>
      tx.insertAlert(newAlert({ kind: "backoffice_recovery_requested" })),
    );

    await expect(
      store.transaction((tx) => tx.lockOpenAlertOfKey("user_email_changed", "user-1")),
    ).resolves.toBeUndefined();
  });
});

describe("DrizzleAlertStore recordConditionCleared and recordConditionHolding", () => {
  it("marks only the given alert as cleared at the given moment, then removes the mark", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const marked = await store.transaction((tx) => tx.insertAlert(newAlert()));
    const untouched = await store.transaction((tx) =>
      tx.insertAlert(newAlert({ scope: "user-2" })),
    );

    await store.transaction((tx) => tx.recordConditionCleared(marked, NOON));

    const [hit] = await db.select().from(alerts).where(eq(alerts.id, marked));
    const [miss] = await db.select().from(alerts).where(eq(alerts.id, untouched));
    expect(hit?.conditionClearedAt).toEqual(NOON);
    expect(miss?.conditionClearedAt).toBeNull();

    await store.transaction((tx) => tx.recordConditionHolding(marked));

    const [after] = await db.select().from(alerts).where(eq(alerts.id, marked));
    expect(after?.conditionClearedAt).toBeNull();
  });
});

describe("DrizzleAlertStore lockClearedConditionAlerts", () => {
  it("lists only the open alerts whose condition cleared, with what a resolution keeps", async () => {
    const store = new DrizzleAlertStore(db, () => NOON);
    const waiting = await store.transaction((tx) => tx.insertAlert(newAlert()));
    await store.transaction((tx) => tx.insertAlert(newAlert({ scope: "user-2" })));
    const closed = await store.transaction((tx) => tx.insertAlert(newAlert({ scope: "user-3" })));
    await db.update(alerts).set({ conditionClearedAt: NOON }).where(eq(alerts.id, waiting));
    await db
      .update(alerts)
      .set({ conditionClearedAt: NOON, resolvedAt: NOON })
      .where(eq(alerts.id, closed));

    const locked = await store.transaction((tx) => tx.lockClearedConditionAlerts());

    expect(locked).toEqual([
      {
        alertId: waiting,
        kind: "user_email_changed",
        scope: "user-1",
        detail: { previousEmail: "a@example.com", newEmail: "b@example.com", actorId: "actor-1" },
        conditionClearedAt: NOON,
      },
    ]);
  });
});

describe("DrizzleAlertStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleAlertStore>
    >();
  });
});
