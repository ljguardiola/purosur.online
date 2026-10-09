import { buyerIdentificationThresholdOverviewSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import {
  buyerIdentificationThresholds,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { removeSeededThreshold } from "../test-support/remove-seeded-threshold.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerBuyerIdentificationThresholdsListRoute } from "./buyer-identification-thresholds-list-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let clock: Date;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  await removeSeededThreshold(testDatabase.db);
  clock = NOON;
  app = Fastify();
  registerBuyerIdentificationThresholdsListRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => clock,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertUserWithPermissions(permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: "Contadora", isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  await db
    .insert(rolePermissions)
    .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  return user.id;
}

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: clock,
    lastSeenAt: clock,
  });
  return rawSessionId;
}

function get(rawSessionId?: string, origin = BACKOFFICE_ORIGIN) {
  return app.inject({
    method: "GET",
    url: "/buyer-identification-thresholds",
    headers: {
      origin,
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
    },
  });
}

describe("GET /buyer-identification-thresholds", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await get();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const userId = await insertUserWithPermissions(["change_fiscal_configuration"]);

    const response = await get(await insertSession(userId), "https://attacker.example");

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without the change_fiscal_configuration permission with 403 forbidden", async () => {
    const userId = await insertUserWithPermissions(["sell_and_charge"]);

    const response = await get(await insertSession(userId));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers nothing in effect and nothing scheduled while no threshold was recorded", async () => {
    const userId = await insertUserWithPermissions(["change_fiscal_configuration"]);

    const response = await get(await insertSession(userId));

    expect(response.statusCode).toBe(200);
    expect(buyerIdentificationThresholdOverviewSchema.parse(response.json())).toEqual({
      in_effect: null,
      scheduled: null,
      earliest_valid_from: "2026-01-05",
    });
  });

  it("answers the threshold in effect today and the scheduled one", async () => {
    const userId = await insertUserWithPermissions(["change_fiscal_configuration"]);
    await db.insert(buyerIdentificationThresholds).values([
      { amount: 3_500_000_000, validFrom: "2026-10-01", recordedBy: userId },
      { amount: 2_000_000, validFrom: "2026-01-05", recordedBy: userId },
      { amount: 1_000_000, validFrom: "2025-06-01", recordedBy: userId },
    ]);

    const response = await get(await insertSession(userId));

    expect(response.statusCode).toBe(200);
    const body = buyerIdentificationThresholdOverviewSchema.parse(response.json());
    expect([body.in_effect?.amount, body.in_effect?.valid_from]).toEqual([2_000_000, "2026-01-05"]);
    expect([body.scheduled?.amount, body.scheduled?.valid_from]).toEqual([
      3_500_000_000,
      "2026-10-01",
    ]);
  });

  it("answers the Argentina calendar day, not the UTC one", async () => {
    clock = new Date("2026-01-06T01:30:00.000Z");
    const userId = await insertUserWithPermissions(["change_fiscal_configuration"]);
    await db.insert(buyerIdentificationThresholds).values([
      { amount: 1_000_000, validFrom: "2026-01-01", recordedBy: userId },
      { amount: 2_000_000, validFrom: "2026-01-06", recordedBy: userId },
    ]);

    const response = await get(await insertSession(userId));

    const body = buyerIdentificationThresholdOverviewSchema.parse(response.json());
    expect(body.in_effect?.valid_from).toBe("2026-01-01");
    expect(body.scheduled?.valid_from).toBe("2026-01-06");
    expect(body.earliest_valid_from).toBe("2026-01-05");
  });

  it("answers today as the earliest day a threshold may start", async () => {
    const userId = await insertUserWithPermissions(["change_fiscal_configuration"]);

    const response = await get(await insertSession(userId));

    expect(buyerIdentificationThresholdOverviewSchema.parse(response.json())).toMatchObject({
      earliest_valid_from: "2026-01-05",
    });
  });

  it("answers the earliest day of the same day it split the thresholds on, when midnight passes while it answers", async () => {
    const userId = await insertUserWithPermissions(["change_fiscal_configuration"]);
    await db
      .insert(buyerIdentificationThresholds)
      .values({ amount: 1_000_000, validFrom: "2026-01-06", recordedBy: userId });
    clock = new Date("2026-01-06T02:59:59.999Z");
    const rawSessionId = await insertSession(userId);
    const readings = [clock, clock];
    await app.close();
    app = Fastify();
    registerBuyerIdentificationThresholdsListRoute(app, {
      db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => readings.shift() ?? new Date("2026-01-06T03:00:00.000Z"),
    });

    const response = await get(rawSessionId);

    const body = buyerIdentificationThresholdOverviewSchema.parse(response.json());
    expect([body.scheduled?.valid_from, body.earliest_valid_from]).toEqual([
      "2026-01-06",
      "2026-01-05",
    ]);
  });

  it("answers no threshold in effect while every one starts later", async () => {
    const userId = await insertUserWithPermissions(["change_fiscal_configuration"]);
    await db
      .insert(buyerIdentificationThresholds)
      .values({ amount: 1_000_000, validFrom: "2026-03-01", recordedBy: userId });

    const response = await get(await insertSession(userId));

    const body = buyerIdentificationThresholdOverviewSchema.parse(response.json());
    expect(body.in_effect).toBeNull();
    expect(body.scheduled?.valid_from).toBe("2026-03-01");
  });
});
