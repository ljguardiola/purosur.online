import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  branchSettings,
  locations,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerBranchSettingsEditRoute } from "./branch-settings-edit-route.js";
import { registerBranchSettingsReadRoute } from "./branch-settings-read-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  app = Fastify();
  registerBranchSettingsReadRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
  registerBranchSettingsEditRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
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

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    business_name: "Puro Sur - Centro",
    address: "Av. Siempre Viva 742",
    whatsapp_number: "+54 9 11 5555-5555",
    instagram_handle: "@purosur",
    weekday_hours: "9 a 19",
    saturday_hours: "9 a 13",
    sunday_hours: "Cerrado",
    timezone: "America/Argentina/Buenos_Aires",
    expiring_lot_alert_days: 30,
    unreviewed_price_alert_days: 30,
    good_condition_return_days: 15,
    defective_return_days: 180,
    version: 1,
    ...overrides,
  };
}

function putBranchSettings(body: Record<string, unknown>, rawSessionId?: string) {
  return app.inject({
    method: "PUT",
    url: "/branch-settings",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
    payload: body,
  });
}

function getBranchSettings(rawSessionId: string) {
  return app.inject({
    method: "GET",
    url: "/branch-settings",
    headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
  });
}

describe("PUT /branch-settings", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await putBranchSettings(validBody());

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "PUT",
      url: "/branch-settings",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
      payload: validBody(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without the configure_branch permission with 403 forbidden, changing nothing", async () => {
    const cashierRoleId = await insertRole("Cajera", ["sell_and_charge"]);
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await putBranchSettings(validBody(), rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const locationId = await seededLocationId(db);
    const [row] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(row).toMatchObject({ businessName: "", version: 1 });
  });

  it("allows the Administrator, who holds every permission implicitly", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(validBody(), rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("allows a role holding configure_branch explicitly, without Administrator", async () => {
    const managerRoleId = await insertRole("Encargada", ["configure_branch"]);
    const managerId = await insertUser({
      firstName: "Katherine Johnson",
      email: "katherine@example.com",
      roleId: managerRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(managerId);

    const response = await putBranchSettings(validBody(), rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("saves and returns the new values, bumping the version", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(validBody(), rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...validBody(), version: 2 });
    const locationId = await seededLocationId(db);
    const [row] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(row).toMatchObject({ businessName: "Puro Sur - Centro", version: 2 });
  });

  it("makes the change visible to a subsequent GET /branch-settings", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const putResponse = await putBranchSettings(validBody(), rawSessionId);
    expect(putResponse.statusCode).toBe(200);

    const getResponse = await getBranchSettings(rawSessionId);

    expect(getResponse.json()).toEqual({ ...validBody(), version: 2 });
  });

  it("audits the actor and the previous/new values", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);

    const response = await putBranchSettings(validBody(), rawSessionId);

    expect(response.statusCode).toBe(200);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, locationId));
    expect(entry).toMatchObject({
      entity: "branch_settings",
      entityId: locationId,
      actorId: administratorId,
      previousValue: { business_name: "", version: 1 },
      newValue: { business_name: "Puro Sur - Centro", version: 2 },
    });
  });

  it("treats an unchanged save as a no-op: 200, version unchanged, no audit row", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);
    const seededDefaults = {
      business_name: "",
      address: "",
      whatsapp_number: "",
      instagram_handle: "",
      weekday_hours: "",
      saturday_hours: "",
      sunday_hours: "",
      timezone: "America/Argentina/Buenos_Aires",
      expiring_lot_alert_days: 30,
      unreviewed_price_alert_days: 30,
      good_condition_return_days: 15,
      defective_return_days: 180,
      version: 1,
    };

    const response = await putBranchSettings(seededDefaults, rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(seededDefaults);
    const [row] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(row).toMatchObject({ version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, locationId));
    expect(audited).toHaveLength(0);
  });

  it("rejects a defective return window of 179 days, changing nothing", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);

    const response = await putBranchSettings(
      validBody({ defective_return_days: 179 }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "defective_return_days" }],
    });
    const [row] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(row).toMatchObject({ defectiveReturnDays: 180, version: 1 });
  });

  it("accepts a defective return window of exactly 180 days", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(
      validBody({ defective_return_days: 180 }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ defective_return_days: 180 });
  });

  it("accepts a good-condition return window of exactly 0 days, which has no floor", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(
      validBody({ good_condition_return_days: 0 }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ good_condition_return_days: 0 });
  });

  it("rejects a timezone that is not a supported IANA identifier, changing nothing", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);

    const response = await putBranchSettings(
      validBody({ timezone: "Not/A_Real_Zone" }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "timezone" }],
    });
    const [row] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(row).toMatchObject({ timezone: "America/Argentina/Buenos_Aires", version: 1 });
  });

  it("rejects a non-integer window value, changing nothing", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);

    const response = await putBranchSettings(
      validBody({ expiring_lot_alert_days: 30.5 }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "expiring_lot_alert_days" }],
    });
    const [row] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(row).toMatchObject({ expiringLotAlertDays: 30, version: 1 });
  });

  it("returns 409 stale_version and changes nothing when the sent version does not match", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);

    const response = await putBranchSettings(validBody({ version: 2 }), rawSessionId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    const [row] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(row).toMatchObject({ businessName: "", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, locationId));
    expect(audited).toHaveLength(0);
  });

  it("scopes the save to the requesting user's own location, never another branch's", async () => {
    const ownLocationId = await seededLocationId(db);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    await db.insert(branchSettings).values({ locationId: otherLocation.id });
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: ownLocationId,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(validBody(), rawSessionId);

    expect(response.statusCode).toBe(200);
    const [otherRow] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, otherLocation.id));
    expect(otherRow).toMatchObject({ businessName: "", version: 1 });
  });
});
