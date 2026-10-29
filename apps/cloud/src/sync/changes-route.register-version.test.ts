import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceState } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { buildChangesRouteApp, CURRENT_REGISTER_VERSION } from "./test-support/changes-route.js";
import {
  insertLoggedBrand,
  insertLoggedStockMovement,
  insertStockMovementOwners,
} from "./test-support/pull-feed-rows.js";

const NOW = new Date("2026-10-09T16:00:00.000Z");
const OLD_VERSION = "0.0.1271";
const CURRENT_VERSION = CURRENT_REGISTER_VERSION;

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
  app = buildChangesRouteApp(db, { zoneRules: fixedZoneRulesSource(), now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function installationWithTheChangesOfEveryKind(recordedVersion?: string) {
  const installation = await insertEnrolledInstallation(db, { now: NOW });
  if (recordedVersion !== undefined) {
    await db
      .insert(deviceState)
      .values({ deviceId: installation.deviceId, appVersion: recordedVersion });
  }
  const { productId, actorId } = await insertStockMovementOwners(db, installation.locationId);
  const brandId = await insertLoggedBrand(db, "La Serenisima");
  const saleId = await insertLoggedStockMovement(testDatabase, {
    kind: "sale",
    locationId: installation.locationId,
    productId,
    actorId,
  });
  const returnId = await insertLoggedStockMovement(testDatabase, {
    kind: "return",
    locationId: installation.locationId,
    productId,
    actorId,
  });
  return { ...installation, brandId, saleId, returnId };
}

async function pulledAs(
  deviceToken: string,
  { version, query = "" }: { version?: string; query?: string },
) {
  const response = await app.inject({
    method: "GET",
    url: `/changes?since=0${query}`,
    headers: {
      authorization: `Bearer ${deviceToken}`,
      ...(version === undefined ? {} : { "purosur-register-version": version }),
    },
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as { changes: { entity: string; entity_id: string }[] }).changes.filter(
    ({ entity }) => entity === "brand" || entity === "stock_movement",
  );
}

describe("GET /changes for a register whose version it may not read", () => {
  it("gives the brands and the returns to a register declaring a version that reads them", async () => {
    const { deviceToken, brandId, saleId, returnId } =
      await installationWithTheChangesOfEveryKind();

    const pulled = await pulledAs(deviceToken, { version: CURRENT_VERSION });

    expect(pulled.map(({ entity_id }) => entity_id).sort()).toEqual(
      [brandId, saleId, returnId].sort(),
    );
  });

  it("holds back the brands and the returns from a register declaring a version that cannot read them, keeping the sale", async () => {
    const { deviceToken, saleId } = await installationWithTheChangesOfEveryKind();

    const pulled = await pulledAs(deviceToken, { version: OLD_VERSION });

    expect(pulled.map(({ entity_id }) => entity_id)).toEqual([saleId]);
  });

  it("trusts the declared version over the recorded one", async () => {
    const { deviceToken, saleId } = await installationWithTheChangesOfEveryKind(CURRENT_VERSION);

    const pulled = await pulledAs(deviceToken, { version: OLD_VERSION });

    expect(pulled.map(({ entity_id }) => entity_id)).toEqual([saleId]);
  });

  it("uses the version recorded for the installation when the register declares none", async () => {
    const current = await installationWithTheChangesOfEveryKind(CURRENT_VERSION);

    const pulled = await pulledAs(current.deviceToken, {});

    expect(pulled.map(({ entity_id }) => entity_id).sort()).toEqual(
      [current.brandId, current.saleId, current.returnId].sort(),
    );
  });

  it("reads the register as the oldest version when it declares none and none is recorded", async () => {
    const { deviceToken, saleId } = await installationWithTheChangesOfEveryKind();

    const pulled = await pulledAs(deviceToken, {});

    expect(pulled.map(({ entity_id }) => entity_id)).toEqual([saleId]);
  });

  it("falls back to the recorded version when the declared one is malformed", async () => {
    const { deviceToken, saleId } = await installationWithTheChangesOfEveryKind(OLD_VERSION);

    const pulled = await pulledAs(deviceToken, { version: "1.0.1385-beta" });

    expect(pulled.map(({ entity_id }) => entity_id)).toEqual([saleId]);
  });

  it("keeps the recorded version of the installation, which pulling does not change", async () => {
    const { deviceToken, deviceId } = await installationWithTheChangesOfEveryKind(CURRENT_VERSION);

    await pulledAs(deviceToken, { version: OLD_VERSION });

    const [state] = await db.select().from(deviceState).where(eq(deviceState.deviceId, deviceId));
    expect(state?.appVersion).toBe(CURRENT_VERSION);
  });

  it("holds back the same changes when the register asks for one entity again", async () => {
    const { deviceToken, saleId } = await installationWithTheChangesOfEveryKind();

    const brands = await pulledAs(deviceToken, { version: OLD_VERSION, query: "&entity=brand" });
    const movements = await pulledAs(deviceToken, {
      version: OLD_VERSION,
      query: "&entity=stock_movement",
    });
    const readableBrands = await pulledAs(deviceToken, {
      version: CURRENT_VERSION,
      query: "&entity=brand",
    });

    expect(brands).toEqual([]);
    expect(movements.map(({ entity_id }) => entity_id)).toEqual([saleId]);
    expect(readableBrands).toHaveLength(1);
  });
});
