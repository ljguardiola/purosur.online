import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { alerts, locations, rolePermissions, roles, userRoles, users } from "../db/schema.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  canSeeAnyAlerts,
  visibleAlertsCondition,
  visibleToUsersCondition,
} from "./alert-visibility.js";

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

async function insertRole(permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: `role-${permissionKeys.join("-") || "none"}`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: inserting the role returned no row");
  }
  for (const permissionKey of permissionKeys) {
    await db.insert(rolePermissions).values({ roleId: role.id, permissionKey });
  }
  return role.id;
}

async function insertUser(
  name: string,
  roleId: string,
  locationId: string = ownLocationId,
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: name, email: `${name.toLowerCase()}@example.com`, locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

async function insertAlert(input: {
  audience: "local" | "all";
  locationId?: string;
}): Promise<string> {
  const [row] = await db
    .insert(alerts)
    .values({
      kind: "user_email_changed",
      scope: `user-${randomUUID()}`,
      level: "warning",
      audience: input.audience,
      locationId: input.audience === "local" ? (input.locationId ?? ownLocationId) : null,
      detail: {},
    })
    .returning({ id: alerts.id });
  if (!row) {
    throw new Error("test setup: inserting the alert returned no row");
  }
  return row.id;
}

async function visibleAlertIds(access: Parameters<typeof visibleAlertsCondition>[0]) {
  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(visibleAlertsCondition(access));
  return rows.map((row) => row.id);
}

/**
 * `visibleAlertsCondition` and `visibleToUsersCondition` (`alert-visibility.ts`) are the audience
 * rule's only two definitions, one per direction it's needed in: filtering alerts down to what a
 * viewer can see, and filtering users down to who can see a newly opened alert. Every consumer
 * (`alerts-list-route.ts`, `alert-read-route.ts`'s `findAlertById` shared by `alert-close-route.ts`,
 * and `open-alert.ts`'s `recipientsFor`) imports one of these two instead of its own copy, so this
 * is the one place the rule itself — Administrator, All, Local, own branch, another branch, no
 * permission — is tested; their own tests stay wiring-only.
 */
describe("visibleAlertsCondition", () => {
  it("lets an Administrator see every alert, Local or All, of any branch", async () => {
    const allAlert = await insertAlert({ audience: "all" });
    const ownLocalAlert = await insertAlert({ audience: "local", locationId: ownLocationId });
    const otherLocalAlert = await insertAlert({ audience: "local", locationId: otherLocationId });

    const ids = await visibleAlertIds({
      isAdministrator: true,
      permissionKeys: [],
      locationId: ownLocationId,
    });

    expect(ids.sort()).toEqual([allAlert, ownLocalAlert, otherLocalAlert].sort());
  });

  it("lets a view_all_alerts holder see every alert regardless of audience or branch", async () => {
    const allAlert = await insertAlert({ audience: "all" });
    const ownLocalAlert = await insertAlert({ audience: "local", locationId: ownLocationId });
    const otherLocalAlert = await insertAlert({ audience: "local", locationId: otherLocationId });

    const ids = await visibleAlertIds({
      isAdministrator: false,
      permissionKeys: ["view_all_alerts"],
      locationId: ownLocationId,
    });

    expect(ids.sort()).toEqual([allAlert, ownLocalAlert, otherLocalAlert].sort());
  });

  it("lets a view_branch_alerts holder see only a Local alert of their own branch", async () => {
    await insertAlert({ audience: "all" });
    const ownLocalAlert = await insertAlert({ audience: "local", locationId: ownLocationId });
    await insertAlert({ audience: "local", locationId: otherLocationId });

    const ids = await visibleAlertIds({
      isAdministrator: false,
      permissionKeys: ["view_branch_alerts"],
      locationId: ownLocationId,
    });

    expect(ids).toEqual([ownLocalAlert]);
  });

  it("never lets a view_branch_alerts holder see another branch's Local alert or an All one", async () => {
    await insertAlert({ audience: "all" });
    await insertAlert({ audience: "local", locationId: otherLocationId });

    const ids = await visibleAlertIds({
      isAdministrator: false,
      permissionKeys: ["view_branch_alerts"],
      locationId: ownLocationId,
    });

    expect(ids).toEqual([]);
  });

  it("lets a viewer with neither alert-view permission see nothing at all, even a Local alert of their own branch", async () => {
    await insertAlert({ audience: "all" });
    await insertAlert({ audience: "local", locationId: ownLocationId });

    const ids = await visibleAlertIds({
      isAdministrator: false,
      permissionKeys: [],
      locationId: ownLocationId,
    });

    expect(ids).toEqual([]);
  });
});

describe("visibleToUsersCondition", () => {
  async function matchingRecipients(scope: {
    audience: "local" | "all";
    locationId: string | undefined;
  }): Promise<string[]> {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(visibleToUsersCondition(db, scope));
    return rows.map((row) => row.id);
  }

  it("matches an Administrator and every view_all_alerts holder for an All-audience alert", async () => {
    const administratorId = await insertUser("Ada", await seededAdministratorRoleId());
    const viewAllRoleId = await insertRole(["view_all_alerts"]);
    const supervisorId = await insertUser("Grace", viewAllRoleId);
    const viewLocalRoleId = await insertRole(["view_branch_alerts"]);
    await insertUser("Local", viewLocalRoleId);

    const ids = await matchingRecipients({ audience: "all", locationId: undefined });

    expect(ids.sort()).toEqual([administratorId, supervisorId].sort());
  });

  it("matches an Administrator, every view_all_alerts holder, and only the own-branch view_branch_alerts holders for a Local alert", async () => {
    const administratorId = await insertUser("Ada", await seededAdministratorRoleId());
    const viewAllRoleId = await insertRole(["view_all_alerts"]);
    const supervisorId = await insertUser("Grace", viewAllRoleId);
    const viewLocalRoleId = await insertRole(["view_branch_alerts"]);
    const ownBranchCashierId = await insertUser("Local", viewLocalRoleId);
    await insertUser("Other Branch", viewLocalRoleId, otherLocationId);
    const noViewRoleId = await insertRole([]);
    await insertUser("Sin permiso", noViewRoleId);

    const ids = await matchingRecipients({ audience: "local", locationId: ownLocationId });

    expect(ids.sort()).toEqual([administratorId, supervisorId, ownBranchCashierId].sort());
  });

  it("matches no one with neither alert-view permission", async () => {
    const noViewRoleId = await insertRole([]);
    await insertUser("Sin permiso", noViewRoleId);

    const allIds = await matchingRecipients({ audience: "all", locationId: undefined });
    const localIds = await matchingRecipients({ audience: "local", locationId: ownLocationId });

    expect(allIds).toEqual([]);
    expect(localIds).toEqual([]);
  });
});

describe("canSeeAnyAlerts", () => {
  it("is true for an Administrator, a view_all_alerts holder or a view_branch_alerts holder, false otherwise", () => {
    expect(canSeeAnyAlerts({ isAdministrator: true, permissionKeys: [] })).toBe(true);
    expect(canSeeAnyAlerts({ isAdministrator: false, permissionKeys: ["view_all_alerts"] })).toBe(
      true,
    );
    expect(
      canSeeAnyAlerts({ isAdministrator: false, permissionKeys: ["view_branch_alerts"] }),
    ).toBe(true);
    expect(canSeeAnyAlerts({ isAdministrator: false, permissionKeys: [] })).toBe(false);
  });
});
