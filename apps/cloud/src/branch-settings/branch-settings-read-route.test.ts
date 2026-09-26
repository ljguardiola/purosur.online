import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
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

function getBranchSettings(rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: "/branch-settings",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
  });
}

describe("GET /branch-settings", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getBranchSettings();

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
      method: "GET",
      url: "/branch-settings",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without the configure_branch permission with 403 forbidden", async () => {
    const cashierRoleId = await insertRole("Cajera", ["sell_and_charge"]);
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await getBranchSettings(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("allows the Administrator, who holds every permission implicitly", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getBranchSettings(rawSessionId);

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

    const response = await getBranchSettings(rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("returns the seeded location's defaults with version 1", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getBranchSettings(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
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
    });
  });

  it("returns a day's ranges as opens_at/closes_at, in position order", async () => {
    const ownLocationId = await seededLocationId(db);
    await db.insert(branchHours).values([
      { locationId: ownLocationId, dayOfWeek: 1, position: 0, opensAt: "09:00", closesAt: "13:00" },
      { locationId: ownLocationId, dayOfWeek: 1, position: 1, opensAt: "17:00", closesAt: "21:00" },
    ]);

    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: ownLocationId,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getBranchSettings(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      monday_hours: [
        { opens_at: "09:00", closes_at: "13:00" },
        { opens_at: "17:00", closes_at: "21:00" },
      ],
    });
  });

  it("keeps each day's hours independent of the others", async () => {
    const ownLocationId = await seededLocationId(db);
    await db.insert(branchHours).values([
      {
        locationId: ownLocationId,
        dayOfWeek: 6,
        position: 0,
        opensAt: "09:00",
        closesAt: "13:00",
      },
    ]);

    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: ownLocationId,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getBranchSettings(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      saturday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
      sunday_hours: [],
    });
  });

  it("scopes the answer to the requesting user's own location, never another branch's", async () => {
    const ownLocationId = await seededLocationId(db);
    await db
      .update(branchSettings)
      .set({ address: "Av. Centro 100" })
      .where(eq(branchSettings.locationId, ownLocationId));

    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    await db.insert(branchSettings).values({
      locationId: otherLocation.id,
      address: "Av. Norte 200",
      priceListId: await seededPriceListId(db),
    });

    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: ownLocationId,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getBranchSettings(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ address: "Av. Centro 100" });
  });
});
