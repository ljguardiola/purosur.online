import { cloudErrorSchema } from "@purosur/contracts";
import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleRegisterPointOfSaleStore } from "../fiscal/drizzle-register-point-of-sale-store.js";
import { deviceState, fiscalAddresses, registers, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { buildChangesRouteApp, pulledPage } from "./test-support/changes-route.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const LATER = new Date("2026-09-29T13:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let now: Date;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  now = NOW;
  app = buildChangesRouteApp(db, { now: () => now });
});

afterEach(async () => {
  await app.close();
});

async function insertRegister(locationId: string, name: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

async function configurePointOfSale(
  locationId: string,
  registerId: string,
  pointOfSaleNumber: number,
) {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: `Deposito ${pointOfSaleNumber}`, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: `ada-${pointOfSaleNumber}@example.com`, locationId })
    .returning({ id: users.id });
  if (!fiscalAddress || !actor) {
    throw new Error("test setup: seeding the point of sale's references returned no row");
  }
  const outcome = await configureRegisterPointOfSale(
    new DrizzleRegisterPointOfSaleStore(db, () => NOW),
    {
      locationId,
      registerId,
      pointOfSaleNumber,
      fiscalAddressId: fiscalAddress.id,
      version: 0,
      actorId: actor.id,
    },
  );
  if (outcome.kind !== "configured") {
    throw new Error(`test setup: configuring ended as ${outcome.kind}`);
  }
}

async function registerWithPointOfSale() {
  const locationId = await seededLocationId(db);
  const registerId = await insertRegister(locationId, "Caja 1");
  const { deviceId, deviceToken } = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: registerId,
  });
  await configurePointOfSale(locationId, registerId, 7);
  return { locationId, registerId, deviceId, deviceToken };
}

describe("GET /changes asking for one entity", () => {
  it("gives the register's changes of that entity alone, from the cursor it is asked from", async () => {
    const { registerId, deviceToken } = await registerWithPointOfSale();

    const everything = await pulledPage(app, 0, deviceToken);
    const ofEntity = await pulledPage(app, 0, deviceToken, { entity: "register_point_of_sale" });

    expect(everything.changes.some(({ entity }) => entity !== "register_point_of_sale")).toBe(true);
    expect(ofEntity.changes).toEqual(
      everything.changes.filter(({ entity }) => entity === "register_point_of_sale"),
    );
    expect(ofEntity.changes.map(({ entity_id }) => entity_id)).toEqual([registerId]);
    expect(ofEntity.cursor).toBe(ofEntity.changes.at(-1)?.change_seq);
  });

  it("gives nothing of the entity past the cursor it is asked from", async () => {
    const { deviceToken } = await registerWithPointOfSale();
    const everything = await pulledPage(app, 0, deviceToken);

    const page = await pulledPage(app, everything.cursor, deviceToken, {
      entity: "register_point_of_sale",
    });

    expect(page).toEqual({ changes: [], cursor: everything.cursor, has_more: false });
  });

  it("gives nothing of another register's changes of that entity", async () => {
    const { locationId, deviceToken } = await registerWithPointOfSale();
    await configurePointOfSale(locationId, await insertRegister(locationId, "Caja 2"), 8);

    const page = await pulledPage(app, 0, deviceToken, { entity: "register_point_of_sale" });

    expect(page.changes).toHaveLength(1);
  });

  it("leaves the cursor the device last asked from and when, as a pull of everything left it", async () => {
    const { deviceId, deviceToken } = await registerWithPointOfSale();
    await pulledPage(app, 3, deviceToken);
    now = LATER;

    await pulledPage(app, 0, deviceToken, { entity: "register_point_of_sale" });

    expect(
      await db
        .select({
          lastPullSince: deviceState.lastPullSince,
          lastPulledAt: deviceState.lastPulledAt,
        })
        .from(deviceState)
        .where(eq(deviceState.deviceId, deviceId)),
    ).toEqual([{ lastPullSince: 3, lastPulledAt: NOW }]);
  });

  it("records no cursor for a device that never pulled everything", async () => {
    const { deviceToken } = await registerWithPointOfSale();

    await pulledPage(app, 0, deviceToken, { entity: "register_point_of_sale" });

    expect(await db.select().from(deviceState)).toEqual([]);
  });

  it("refuses an entity that is not pulled, naming the field", async () => {
    const { deviceToken } = await registerWithPointOfSale();

    const response = await app.inject({
      method: "GET",
      url: "/changes?since=0&entity=warehouse",
      headers: { authorization: `Bearer ${deviceToken}` },
    });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "entity" }],
    });
  });
});
