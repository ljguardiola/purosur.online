import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  branchHours,
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
import { seededPriceListId } from "../test-support/seeded-price-list.js";
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
    address: "Av. Siempre Viva 742",
    whatsapp_number: "+54 9 11 5555-5555",
    instagram_handle: "@purosur",
    monday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
    tuesday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
    wednesday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
    thursday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
    friday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
    saturday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
    sunday_hours: [],
    expiring_lot_alert_days: 30,
    unreviewed_price_alert_days: 30,
    good_condition_return_days: 15,
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
    expect(row).toMatchObject({ address: "", version: 1 });
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
    expect(row).toMatchObject({ address: "Av. Siempre Viva 742", version: 2 });
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

    const mondayHours = [
      { opens_at: "09:00", closes_at: "13:00" },
      { opens_at: "17:00", closes_at: "21:00" },
    ];

    const response = await putBranchSettings(
      validBody({ monday_hours: mondayHours }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, locationId));
    expect(entry).toMatchObject({
      entity: "branch_settings",
      entityId: locationId,
      actorId: administratorId,
      previousValue: {
        address: "",
        version: 1,
        monday_hours: [],
        tuesday_hours: [],
        wednesday_hours: [],
        thursday_hours: [],
        friday_hours: [],
        saturday_hours: [],
        sunday_hours: [],
      },
      newValue: {
        address: "Av. Siempre Viva 742",
        version: 2,
        monday_hours: mondayHours,
        tuesday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
        wednesday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
        thursday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
        friday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
        saturday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
        sunday_hours: [],
      },
    });
  });

  it("treats re-saving the same non-empty hours as a no-op: version unchanged, no new audit row", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);
    const body = validBody({
      monday_hours: [
        { opens_at: "09:00", closes_at: "13:00" },
        { opens_at: "17:00", closes_at: "21:00" },
      ],
    });
    const first = await putBranchSettings(body, rawSessionId);
    expect(first.statusCode).toBe(200);

    const response = await putBranchSettings({ ...body, version: 2 }, rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...body, version: 2 });
    const [row] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(row).toMatchObject({ version: 2 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, locationId));
    expect(audited).toHaveLength(1);
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
      address: "",
      whatsapp_number: "",
      instagram_handle: "",
      monday_hours: [],
      tuesday_hours: [],
      wednesday_hours: [],
      thursday_hours: [],
      friday_hours: [],
      saturday_hours: [],
      sunday_hours: [],
      expiring_lot_alert_days: 30,
      unreviewed_price_alert_days: 30,
      good_condition_return_days: 15,
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

  it("rejects a range where closing isn't later than opening, changing nothing", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);

    const response = await putBranchSettings(
      validBody({ monday_hours: [{ opens_at: "18:00", closes_at: "09:00" }] }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "monday_hours" }],
    });
    const rows = await db.select().from(branchHours).where(eq(branchHours.locationId, locationId));
    expect(rows).toHaveLength(0);
    const [settingsRow] = await db
      .select()
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    expect(settingsRow).toMatchObject({ version: 1 });
  });

  it("saves more than one range on the same day, in the order they were sent", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(
      validBody({
        monday_hours: [
          { opens_at: "09:00", closes_at: "13:00" },
          { opens_at: "17:00", closes_at: "21:00" },
        ],
      }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      monday_hours: [
        { opens_at: "09:00", closes_at: "13:00" },
        { opens_at: "17:00", closes_at: "21:00" },
      ],
    });
  });

  it("keeps each day's hours independent when only one day is changed", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const firstResponse = await putBranchSettings(validBody(), rawSessionId);
    expect(firstResponse.statusCode).toBe(200);

    const response = await putBranchSettings(
      validBody({ friday_hours: [{ opens_at: "09:00", closes_at: "21:00" }], version: 2 }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      friday_hours: [{ opens_at: "09:00", closes_at: "21:00" }],
      monday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
      tuesday_hours: [{ opens_at: "09:00", closes_at: "19:00" }],
    });
  });

  it("accepts every day closed (an empty list), the seeded default", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(
      validBody({
        monday_hours: [],
        tuesday_hours: [],
        wednesday_hours: [],
        thursday_hours: [],
        friday_hours: [],
        saturday_hours: [],
        sunday_hours: [],
      }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      monday_hours: [],
      tuesday_hours: [],
      wednesday_hours: [],
      thursday_hours: [],
      friday_hours: [],
      saturday_hours: [],
      sunday_hours: [],
    });
  });

  it("ignores fields removed from the contract, such as business_name or timezone, when a client still sends them", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(
      validBody({ business_name: "Legacy name", timezone: "America/Argentina/Buenos_Aires" }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty("business_name");
    expect(response.json()).not.toHaveProperty("timezone");
  });

  it("accepts a window value of 2147483647 days, the largest the database stores", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await putBranchSettings(
      validBody({ unreviewed_price_alert_days: 2147483647 }),
      rawSessionId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ unreviewed_price_alert_days: 2147483647 });
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
    expect(row).toMatchObject({ address: "", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, locationId));
    expect(audited).toHaveLength(0);
  });

  it("scopes the save to the requesting user's own location, never another branch's", async () => {
    const ownLocationId = await seededLocationId(db);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    await db
      .insert(branchSettings)
      .values({ locationId: otherLocation.id, priceListId: await seededPriceListId(db) });
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
    expect(otherRow).toMatchObject({ address: "", version: 1 });
  });
});

describe("branch_hours' CHECK constraints, enforced at the database itself", () => {
  it("rejects a day_of_week outside 1..7, even bypassing the route", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }

    await expect(
      db.insert(branchHours).values({
        locationId: otherLocation.id,
        dayOfWeek: 8,
        position: 0,
        opensAt: "09:00",
        closesAt: "18:00",
      }),
    ).rejects.toThrow();
  });

  it("rejects a range whose closing time isn't later than its opening time, even bypassing the route", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }

    await expect(
      db.insert(branchHours).values({
        locationId: otherLocation.id,
        dayOfWeek: 6,
        position: 0,
        opensAt: "13:00",
        closesAt: "09:00",
      }),
    ).rejects.toThrow();
  });

  it("accepts a valid range", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }

    await expect(
      db.insert(branchHours).values({
        locationId: otherLocation.id,
        dayOfWeek: 1,
        position: 0,
        opensAt: "09:00",
        closesAt: "18:00",
      }),
    ).resolves.not.toThrow();
  });
});
