import { changesPageSchema, cloudErrorSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import { editBranchSettings } from "../branch/branch-settings-edit-route.js";
import { branchSettings, changes, deviceState, locations, users } from "../platform/db/schema.js";
import { issueDeviceToken } from "../register/device-token.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { registerChangesRoute } from "./changes-route.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

const DEFAULT_SETTINGS_ROW = {
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
  registerRouteAccess(app);
  registerChangesRoute(app, { db, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function pull(query: string, authorization?: string) {
  return app.inject({
    method: "GET",
    url: `/changes${query}`,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

async function pullPage(since: number, deviceToken: string) {
  const response = await pull(`?since=${since}`, `Bearer ${deviceToken}`);
  expect(response.statusCode).toBe(200);
  return changesPageSchema.parse(response.json());
}

async function insertOtherBranch(): Promise<string> {
  const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!otherLocation) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  await db
    .insert(branchSettings)
    .values({ locationId: otherLocation.id, priceListId: await seededPriceListId(db) });
  await db.insert(changes).values({
    entity: "branch_settings",
    entityId: otherLocation.id,
    version: 1,
    op: "insert",
  });
  return otherLocation.id;
}

async function insertActor(locationId: string): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lovelace", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

function settingsEdit(locationId: string, actorId: string, version: number, address: string) {
  return {
    locationId,
    actorId,
    address,
    whatsappNumber: "",
    instagramHandle: "",
    mondayHours: [{ opensAt: "09:00", closesAt: "13:00" }],
    tuesdayHours: [],
    wednesdayHours: [],
    thursdayHours: [],
    fridayHours: [],
    saturdayHours: [],
    sundayHours: [],
    expiringLotAlertDays: 30,
    unreviewedPriceAlertDays: 30,
    goodConditionReturnDays: 15,
    version,
  };
}

describe("GET /changes", () => {
  it("gives a brand-new installation its branch's settings, with their version, from the very first cursor", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db);

    const page = await pullPage(0, deviceToken);

    expect(page).toEqual({
      changes: [
        {
          change_seq: 1,
          entity: "branch_settings",
          entity_id: locationId,
          row: DEFAULT_SETTINGS_ROW,
        },
      ],
      cursor: 1,
      has_more: false,
    });
  });

  it("gives only the branch the token belongs to, whatever else the request names", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db);
    const otherLocationId = await insertOtherBranch();

    const response = await pull(
      `?since=0&location_id=${otherLocationId}&register_id=${otherLocationId}`,
      `Bearer ${deviceToken}`,
    );

    expect(response.statusCode).toBe(200);
    const page = changesPageSchema.parse(response.json());
    expect(page.changes.map((change) => change.entity_id)).toEqual([locationId]);
  });

  it("gives nothing and keeps the cursor once the register has every change", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);

    expect(await pullPage(1, deviceToken)).toEqual({ changes: [], cursor: 1, has_more: false });
  });

  it("reaches a register only on its next pull after a backoffice edit, with the edited row and its new version", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db);
    const first = await pullPage(0, deviceToken);

    await editBranchSettings(
      db,
      settingsEdit(locationId, await insertActor(locationId), 1, "Av. Belgrano 1450"),
    );
    const next = await pullPage(first.cursor, deviceToken);

    expect(next.changes).toEqual([
      {
        change_seq: 2,
        entity: "branch_settings",
        entity_id: locationId,
        row: {
          ...DEFAULT_SETTINGS_ROW,
          address: "Av. Belgrano 1450",
          monday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
          version: 2,
        },
      },
    ]);
    expect(next).toMatchObject({ cursor: 2, has_more: false });
  });

  it("pages more than 500 changes through, 500 at a time, until none is left", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db);
    await db.insert(changes).values(
      Array.from({ length: 600 }, (_, index) => ({
        entity: "branch_settings",
        entityId: locationId,
        version: index + 2,
        op: "update" as const,
      })),
    );

    const first = await pullPage(0, deviceToken);
    const second = await pullPage(first.cursor, deviceToken);

    expect(first.changes).toHaveLength(500);
    expect(first).toMatchObject({ cursor: 500, has_more: true });
    expect(second.changes).toHaveLength(101);
    expect(second.changes[0]?.change_seq).toBe(501);
    expect(second).toMatchObject({ cursor: 601, has_more: false });
  });

  it("records the cursor each device last asked from and when", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db);

    await pullPage(0, deviceToken);
    await pullPage(1, deviceToken);

    expect(await db.select().from(deviceState).where(eq(deviceState.deviceId, deviceId))).toEqual([
      { deviceId, lastPullSince: 1, lastPulledAt: NOW },
    ]);
  });

  it.each([
    ["no device token", undefined],
    ["a device token no installation holds", `Bearer ${issueDeviceToken().deviceToken}`],
    ["something that is not a device token", "Basic dXNlcjpwYXNz"],
  ])("refuses a request with %s, giving nothing", async (_case, authorization) => {
    await insertEnrolledInstallation(db);

    const response = await pull("?since=0", authorization);

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
  });

  it("refuses a revoked installation's token, recording nothing", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, {
      revokedAt: new Date("2026-09-29T09:00:00.000Z"),
    });

    const response = await pull("?since=0", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
    expect(await db.select().from(deviceState)).toEqual([]);
  });

  it("refuses a since that is not a cursor, naming the field", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);

    const response = await pull("?since=-1", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "since" }],
    });
  });

  it("answers a failure with the cloud error envelope, revealing nothing of it", async () => {
    const broken = await buildTestDatabase();
    await broken.close();
    const failing = Fastify();
    registerRouteAccess(failing);
    registerChangesRoute(failing, { db: broken.db });

    const response = await failing.inject({
      method: "GET",
      url: "/changes?since=0",
      headers: { authorization: `Bearer ${issueDeviceToken().deviceToken}` },
    });
    await failing.close();

    expect(response.statusCode).toBe(500);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "internal_error" });
    expect(response.body).not.toContain("register_installations");
  });
});
