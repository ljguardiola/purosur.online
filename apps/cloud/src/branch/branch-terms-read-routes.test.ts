import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  branchSettings,
  locations,
  rolePermissions,
  roles,
  sessions,
  supplierPriceListExtractionCaps,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerBranchTermsReadRoutes } from "./branch-terms-read-routes.js";

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
  registerBranchTermsReadRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
});

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

function getTerm(url: string, rawSessionId?: string, origin = BACKOFFICE_ORIGIN) {
  return app.inject({
    method: "GET",
    url,
    headers: { origin, ...(rawSessionId ? cookieHeader(rawSessionId) : {}) },
  });
}

async function sessionOfRole(permissionKeys: string[]): Promise<string> {
  const userId = await insertUser({
    firstName: "Grace Villalba",
    email: "grace@example.com",
    roleId: await insertRole("Rol de prueba", permissionKeys),
    locationId: await seededLocationId(db),
  });
  return insertSession(userId);
}

const RETURN_DAYS_URL = "/locations/current/good-condition-return-days";
const DAILY_CAP_URL = "/locations/current/supplier-price-list-daily-cap";

describe("GET /locations/current/good-condition-return-days", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getTerm(RETURN_DAYS_URL);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await sessionOfRole(["confirm_refunds"]);

    const response = await getTerm(RETURN_DAYS_URL, rawSessionId, "https://attacker.example");

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("refuses a user with neither the refunds nor the returns report capability", async () => {
    const rawSessionId = await sessionOfRole(["sell_and_charge", "configure_branch"]);

    const response = await getTerm(RETURN_DAYS_URL, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it.each([["confirm_refunds"], ["view_returns_report"]])(
    "allows a user holding only %s",
    async (permissionKey) => {
      const rawSessionId = await sessionOfRole([permissionKey as string]);

      const response = await getTerm(RETURN_DAYS_URL, rawSessionId);

      expect(response.statusCode).toBe(200);
    },
  );

  it("returns the default the branch settings show", async () => {
    const rawSessionId = await sessionOfRole(["confirm_refunds"]);

    const response = await getTerm(RETURN_DAYS_URL, rawSessionId);

    expect(response.json()).toEqual({ good_condition_return_days: 15 });
  });

  it("returns the days stored for the user's location", async () => {
    await db
      .update(branchSettings)
      .set({ goodConditionReturnDays: 22 })
      .where(eq(branchSettings.locationId, await seededLocationId(db)));
    const rawSessionId = await sessionOfRole(["view_returns_report"]);

    const response = await getTerm(RETURN_DAYS_URL, rawSessionId);

    expect(response.json()).toEqual({ good_condition_return_days: 22 });
  });
});

describe("GET /locations/current/supplier-price-list-daily-cap", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getTerm(DAILY_CAP_URL);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await sessionOfRole(["manage_supplier_price_lists"]);

    const response = await getTerm(DAILY_CAP_URL, rawSessionId, "https://attacker.example");

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("refuses a user without the supplier price lists capability", async () => {
    const rawSessionId = await sessionOfRole(["confirm_refunds", "configure_branch"]);

    const response = await getTerm(DAILY_CAP_URL, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("returns the default the branch settings show", async () => {
    const rawSessionId = await sessionOfRole(["manage_supplier_price_lists"]);

    const response = await getTerm(DAILY_CAP_URL, rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ supplier_price_list_daily_extraction_cap: 10 });
  });

  it("returns the cap stored for the user's location", async () => {
    await db
      .insert(supplierPriceListExtractionCaps)
      .values({ locationId: await seededLocationId(db), dailyCap: 4 });
    const rawSessionId = await sessionOfRole(["manage_supplier_price_lists"]);

    const response = await getTerm(DAILY_CAP_URL, rawSessionId);

    expect(response.json()).toEqual({ supplier_price_list_daily_extraction_cap: 4 });
  });
});
