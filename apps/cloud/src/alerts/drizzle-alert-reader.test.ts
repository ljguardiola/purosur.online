import type { AlertKind, VisibleAlertSight } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alertDeliveries,
  alerts,
  locations,
  registers,
  roles,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertReader } from "./drizzle-alert-reader.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const ALL: VisibleAlertSight = { kind: "all" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let ownLocationId: string;
let otherLocationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  ownLocationId = await seededLocationId(db);
  const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!otherLocation) {
    throw new Error("test setup: inserting the other location returned no row");
  }
  otherLocationId = otherLocation.id;
});

let scopeCounter = 0;

async function insertAlert(
  input: {
    kind?: string;
    scope?: string;
    level?: "informational" | "warning" | "critical";
    audience?: "local" | "all";
    locationId?: string;
    openedAt?: Date;
    resolvedAt?: Date | null;
  } = {},
): Promise<string> {
  const audience = input.audience ?? "all";
  scopeCounter += 1;
  const [row] = await db
    .insert(alerts)
    .values({
      kind: input.kind ?? "user_email_changed",
      scope: input.scope ?? `scope-${scopeCounter}`,
      level: input.level ?? "warning",
      audience,
      locationId: audience === "local" ? (input.locationId ?? ownLocationId) : null,
      detail: {},
      openedAt: input.openedAt ?? NOON,
      resolvedAt: input.resolvedAt ?? null,
    })
    .returning({ id: alerts.id });
  if (!row) {
    throw new Error("test setup: inserting the alert returned no row");
  }
  return row.id;
}

async function insertUser(firstName: string, roleId?: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName,
      email: `${firstName.toLowerCase().replace(/\s/g, "-")}@example.com`,
      locationId: ownLocationId,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  if (roleId) {
    await db.insert(userRoles).values({ userId: user.id, roleId });
  }
  return user.id;
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

describe("DrizzleAlertReader sight", () => {
  async function visibleIds(sight: VisibleAlertSight): Promise<string[]> {
    const page = await new DrizzleAlertReader(db).listVisibleAlerts(sight, {}, 1);
    return page.alerts.map((alert) => alert.id).sort();
  }

  it("lets the all sight see every alert, Local or All, of any branch", async () => {
    const ids = [
      await insertAlert({ audience: "all" }),
      await insertAlert({ audience: "local", locationId: ownLocationId }),
      await insertAlert({ audience: "local", locationId: otherLocationId }),
    ];

    expect(await visibleIds(ALL)).toEqual(ids.sort());
  });

  it("lets a local sight see only the Local alerts of its own branch", async () => {
    await insertAlert({ audience: "all" });
    const own = await insertAlert({ audience: "local", locationId: ownLocationId });
    await insertAlert({ audience: "local", locationId: otherLocationId });

    expect(await visibleIds({ kind: "local", locationId: ownLocationId })).toEqual([own]);
  });

  it("applies the same sight when finding one alert, counting and summarising the open ones", async () => {
    const own = await insertAlert({
      audience: "local",
      locationId: ownLocationId,
      level: "critical",
      kind: "register_enrolled",
    });
    const foreign = await insertAlert({ audience: "local", locationId: otherLocationId });
    await insertAlert({ audience: "all" });
    const sight: VisibleAlertSight = { kind: "local", locationId: ownLocationId };
    const reader = new DrizzleAlertReader(db);

    expect((await reader.findVisibleAlert(sight, own))?.id).toBe(own);
    expect(await reader.findVisibleAlert(sight, foreign)).toBeUndefined();
    expect(await reader.countOpenVisibleAlerts(sight)).toEqual({
      openCount: 1,
      openCriticalCount: 1,
    });
    expect(await reader.overviewOfOpenVisibleAlerts(sight)).toEqual({
      critical: { openCount: 1, kinds: ["register_enrolled"] },
      warning: { openCount: 0, kinds: [] },
      informational: { openCount: 0, kinds: [] },
    });
  });
});

describe("DrizzleAlertReader findVisibleAlert", () => {
  it("answers the alert's detail and who resolved it", async () => {
    const resolverId = await insertUser("Ada");
    const id = await insertAlert({ resolvedAt: NOON });
    await db
      .update(alerts)
      .set({ resolvedBy: resolverId, detail: { a: 1 } })
      .where(eq(alerts.id, id));

    const found = await new DrizzleAlertReader(db).findVisibleAlert(ALL, id);

    expect(found).toMatchObject({
      id,
      kind: "user_email_changed",
      detail: { a: 1 },
      resolvedAt: NOON,
      resolvedBy: resolverId,
      escalatedAt: null,
    });
  });
});

describe("DrizzleAlertReader listVisibleAlerts", () => {
  it("lists the newest first, one page at a time, with the total", async () => {
    for (let index = 0; index < 27; index += 1) {
      await insertAlert({ openedAt: new Date(NOON.getTime() + index * 1000) });
    }
    const reader = new DrizzleAlertReader(db);

    const first = await reader.listVisibleAlerts(ALL, {}, 1);
    const second = await reader.listVisibleAlerts(ALL, {}, 2);

    expect(first.total).toBe(27);
    expect(first.alerts).toHaveLength(25);
    expect(second.alerts).toHaveLength(2);
    expect(first.alerts[0]?.openedAt).toEqual(new Date(NOON.getTime() + 26_000));
  });

  it("filters by level and by open or closed", async () => {
    const openCritical = await insertAlert({ level: "critical" });
    await insertAlert({ level: "warning" });
    const closedCritical = await insertAlert({ level: "critical", resolvedAt: NOON });
    const reader = new DrizzleAlertReader(db);

    const critical = await reader.listVisibleAlerts(ALL, { level: "critical" }, 1);
    const open = await reader.listVisibleAlerts(ALL, { level: "critical", open: true }, 1);
    const closed = await reader.listVisibleAlerts(ALL, { open: false }, 1);

    expect(critical.alerts.map((a) => a.id).sort()).toEqual([openCritical, closedCritical].sort());
    expect(open.alerts.map((a) => a.id)).toEqual([openCritical]);
    expect(closed.alerts.map((a) => a.id)).toEqual([closedCritical]);
  });

  it("searches by a matching kind title, a user's or register's name, and an open source address", async () => {
    const userId = await insertUser("Lucía Pérez");
    const [register] = await db
      .insert(registers)
      .values({ locationId: ownLocationId, name: "Caja Lucía" })
      .returning({ id: registers.id });
    if (!register) {
      throw new Error("test setup: inserting the register returned no row");
    }
    const byUser = await insertAlert({ kind: "user_email_changed", scope: userId });
    const byRegister = await insertAlert({ kind: "register_enrolled", scope: register.id });
    const byKind = await insertAlert({ kind: "backoffice_passkey_changed", scope: "someone" });
    const byAddress = await insertAlert({
      kind: "backoffice_sign_in_lockout",
      scope: "lucía-host",
    });
    await insertAlert({
      kind: "backoffice_sign_in_lockout",
      scope: "lucía-closed",
      resolvedAt: NOON,
    });
    await insertAlert({ kind: "user_access_increased", scope: "nobody" });
    const reader = new DrizzleAlertReader(db);

    const page = await reader.listVisibleAlerts(
      ALL,
      {
        search: {
          text: "lucía",
          kindsWithMatchingTitle: ["backoffice_passkey_changed" satisfies AlertKind],
        },
      },
      1,
    );

    expect(page.alerts.map((a) => a.id).sort()).toEqual(
      [byUser, byRegister, byKind, byAddress].sort(),
    );
  });

  it("treats the search text literally, not as a pattern", async () => {
    const percent = await insertUser("100% Real");
    await insertUser("Someone else");
    const match = await insertAlert({ kind: "user_email_changed", scope: percent });

    const page = await new DrizzleAlertReader(db).listVisibleAlerts(
      ALL,
      { search: { text: "100%", kindsWithMatchingTitle: [] } },
      1,
    );

    expect(page.alerts.map((a) => a.id)).toEqual([match]);
  });
});

describe("DrizzleAlertReader overviewOfOpenVisibleAlerts", () => {
  it("counts only open alerts per level and lists their kinds in name order", async () => {
    await insertAlert({ kind: "kind_b", level: "critical" });
    await insertAlert({ kind: "kind_a", level: "critical" });
    await insertAlert({ kind: "kind_a", level: "critical" });
    await insertAlert({ kind: "kind_c", level: "warning", resolvedAt: NOON });

    const overview = await new DrizzleAlertReader(db).overviewOfOpenVisibleAlerts(ALL);

    expect(overview.critical).toEqual({ openCount: 3, kinds: ["kind_a", "kind_b"] });
    expect(overview.warning).toEqual({ openCount: 0, kinds: [] });
  });
});

describe("DrizzleAlertReader deliveriesOf", () => {
  it("lists each recipient with their role, oldest delivery first", async () => {
    const alertId = await insertAlert();
    const adminRoleId = await seededAdministratorRoleId();
    const firstUser = await insertUser("Ada", adminRoleId);
    const secondUser = await insertUser("Grace", adminRoleId);
    await db.insert(alertDeliveries).values([
      { alertId, recipientUserId: secondUser, createdAt: new Date(NOON.getTime() + 1000) },
      { alertId, recipientUserId: firstUser, createdAt: NOON },
    ]);

    const deliveries = await new DrizzleAlertReader(db).deliveriesOf(alertId);

    expect(deliveries.map((d) => d.recipientFirstName)).toEqual(["Ada", "Grace"]);
    expect(deliveries[0]).toMatchObject({
      channel: "backoffice",
      status: "sent",
      error: null,
      createdAt: NOON,
      recipientId: firstUser,
      recipientRoleId: adminRoleId,
      recipientRoleIsAdministrator: true,
    });
  });
});

describe("DrizzleAlertReader displayNames", () => {
  it("maps user ids to first names and register ids to register names", async () => {
    const userId = await insertUser("Lucía Pérez");
    const [register] = await db
      .insert(registers)
      .values({ locationId: ownLocationId, name: "Caja 1" })
      .returning({ id: registers.id });
    if (!register) {
      throw new Error("test setup: inserting the register returned no row");
    }

    const names = await new DrizzleAlertReader(db).displayNames([userId, register.id]);

    expect(names.get(userId)).toBe("Lucía Pérez");
    expect(names.get(register.id)).toBe("Caja 1");
  });

  it("answers an empty map for an empty list", async () => {
    expect((await new DrizzleAlertReader(db).displayNames([])).size).toBe(0);
  });

  it("names nothing for a stored value that is no record id, while the record ids beside it are still named", async () => {
    const userId = await insertUser("Lucía Pérez");

    const names = await new DrizzleAlertReader(db).displayNames([userId, "scope-legacy"]);

    expect(names).toEqual(new Map([[userId, "Lucía Pérez"]]));
  });
});
