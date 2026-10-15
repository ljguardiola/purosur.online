import { randomUUID } from "node:crypto";
import { configureRegisterOfflinePointOfSale } from "@purosur/domain/fiscal/use-cases";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleNumberingConflictLanes } from "../fiscal/drizzle-numbering-conflict-lanes.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "../fiscal/drizzle-register-offline-point-of-sale-store.js";
import { DrizzleTaxAuthorityCounts } from "../fiscal/drizzle-tax-authority-counts.js";
import {
  insertAppliedOfflineDocument,
  insertReceivedOfflineDocumentEvent,
} from "../fiscal/test-support/synced-offline-documents.js";
import { locations } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { buildChangesRouteApp, pulledPage } from "./test-support/changes-route.js";
import {
  configurePointOfSale,
  insertActor,
  insertFiscalAddress,
  insertRegister,
} from "./test-support/configured-point-of-sale.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const SEEDED_CHANGES = 4;

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
  app = buildChangesRouteApp(db, { now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function numberingLanes() {
  return new DrizzleNumberingConflictLanes(
    { withConnection: (work) => work(db) },
    async () => {},
    () => NOW,
  );
}

async function pullAfterSeed(deviceToken: string) {
  const page = await pulledPage(app, SEEDED_CHANGES, deviceToken);
  return page.changes.map(({ change_seq, ...change }) => change);
}

async function otherBranchRegister(): Promise<{ locationId: string; registerId: string }> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  return { locationId: location.id, registerId: await insertRegister(db, location.id, "Caja 3") };
}

describe("GET /changes carrying the register's own point of sale", () => {
  it("gives a register its own point of sale and fiscal address, at its version", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress(db);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configurePointOfSale(db, NOW, {
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId: await insertActor(db, locationId),
    });

    expect(await pullAfterSeed(deviceToken)).toEqual([
      {
        entity: "register_point_of_sale",
        entity_id: registerId,
        row: {
          point_of_sale_number: 7,
          fiscal_address_id: fiscalAddressId,
          tax_authority_last_authorized_number: null,
          numbering_frozen: false,
          version: 1,
        },
      },
    ]);
  });

  it("gives a register nothing of another register's point of sale, in its branch or in another", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const sameBranchRegisterId = await insertRegister(db, locationId, "Caja 2");
    const otherBranch = await otherBranchRegister();
    const fiscalAddressId = await insertFiscalAddress(db);
    const actorId = await insertActor(db, locationId);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configurePointOfSale(db, NOW, {
      locationId,
      registerId: sameBranchRegisterId,
      pointOfSaleNumber: 8,
      fiscalAddressId,
      version: 0,
      actorId,
    });
    await configurePointOfSale(db, NOW, {
      ...otherBranch,
      pointOfSaleNumber: 9,
      fiscalAddressId,
      version: 0,
      actorId,
    });

    expect(await pullAfterSeed(deviceToken)).toEqual([]);
  });

  it("gives the point of sale as it is now for every change logged for it", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress(db);
    const actorId = await insertActor(db, locationId);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    const base = { locationId, registerId, fiscalAddressId, actorId };
    await configurePointOfSale(db, NOW, { ...base, pointOfSaleNumber: 7, version: 0 });
    await configurePointOfSale(db, NOW, { ...base, pointOfSaleNumber: 8, version: 1 });

    const pulled = await pullAfterSeed(deviceToken);

    expect(pulled).toEqual([
      {
        entity: "register_point_of_sale",
        entity_id: registerId,
        row: {
          point_of_sale_number: 8,
          fiscal_address_id: fiscalAddressId,
          tax_authority_last_authorized_number: null,
          numbering_frozen: false,
          version: 2,
        },
      },
      {
        entity: "register_point_of_sale",
        entity_id: registerId,
        row: {
          point_of_sale_number: 8,
          fiscal_address_id: fiscalAddressId,
          tax_authority_last_authorized_number: null,
          numbering_frozen: false,
          version: 2,
        },
      },
    ]);
  });

  it("gives the tax authority's last authorized number with the point of sale once it is recorded, at the same version", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress(db);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configurePointOfSale(db, NOW, {
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId: await insertActor(db, locationId),
    });

    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 7,
      lastAuthorized: 41,
      readAt: NOW,
    });

    const pulled = await pullAfterSeed(deviceToken);
    expect(pulled.at(-1)).toEqual({
      entity: "register_point_of_sale",
      entity_id: registerId,
      row: {
        point_of_sale_number: 7,
        fiscal_address_id: fiscalAddressId,
        tax_authority_last_authorized_number: 41,
        numbering_frozen: false,
        version: 1,
      },
    });
  });

  it("gives the point of sale as frozen while its numbering is frozen, at the same version as the count", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress(db);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configurePointOfSale(db, NOW, {
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId: await insertActor(db, locationId),
    });
    const lanes = numberingLanes();

    await lanes.inPointOfSaleLane(7, async (lane) => {
      await lane.continueNumberingAfter(41);
      await lane.freezeNumbering({ countBeforeFreeze: 41, frozenAt: NOW });
    });

    expect((await pullAfterSeed(deviceToken)).at(-1)).toEqual({
      entity: "register_point_of_sale",
      entity_id: registerId,
      row: {
        point_of_sale_number: 7,
        fiscal_address_id: fiscalAddressId,
        tax_authority_last_authorized_number: 41,
        numbering_frozen: true,
        version: 1,
      },
    });
  });

  it("gives the point of sale as not frozen, with the new count, once the freeze is lifted", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress(db);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configurePointOfSale(db, NOW, {
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId: await insertActor(db, locationId),
    });
    const lanes = numberingLanes();
    await lanes.inPointOfSaleLane(7, async (lane) => {
      await lane.continueNumberingAfter(41);
      await lane.freezeNumbering({ countBeforeFreeze: 41, frozenAt: NOW });
    });

    await lanes.inPointOfSaleLane(7, async (lane) => {
      await lane.continueNumberingAfter(44);
      await lane.liftNumberingFreeze();
    });

    expect((await pullAfterSeed(deviceToken)).at(-1)).toEqual({
      entity: "register_point_of_sale",
      entity_id: registerId,
      row: {
        point_of_sale_number: 7,
        fiscal_address_id: fiscalAddressId,
        tax_authority_last_authorized_number: 44,
        numbering_frozen: false,
        version: 1,
      },
    });
  });

  it("gives a register the count of its own point of sale only", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const otherRegisterId = await insertRegister(db, locationId, "Caja 2");
    const fiscalAddressId = await insertFiscalAddress(db);
    const actorId = await insertActor(db, locationId);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configurePointOfSale(db, NOW, {
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId,
    });
    await configurePointOfSale(db, NOW, {
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 8,
      fiscalAddressId,
      version: 0,
      actorId,
    });

    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 8,
      lastAuthorized: 99,
      readAt: NOW,
    });

    const pulled = await pullAfterSeed(deviceToken);
    expect(pulled).toEqual([
      expect.objectContaining({
        row: expect.objectContaining({
          point_of_sale_number: 7,
          tax_authority_last_authorized_number: null,
        }),
      }),
    ]);
  });
});

async function configureOffline(input: {
  locationId: string;
  registerId: string;
  pointOfSaleNumber: number;
  version: number;
  actorId: string;
}) {
  const outcome = await configureRegisterOfflinePointOfSale(
    new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOW),
    input,
  );
  if (outcome.kind !== "configured") {
    throw new Error(`test setup: configuring the offline point of sale ended as ${outcome.kind}`);
  }
}

async function registerWithRealTime(locationId: string, name: string, number: number) {
  const registerId = await insertRegister(db, locationId, name);
  const actorId = await insertActor(db, locationId, `${randomUUID()}@example.com`);
  await configurePointOfSale(db, NOW, {
    locationId,
    registerId,
    pointOfSaleNumber: number,
    fiscalAddressId: await insertFiscalAddress(db, `Deposito ${name}`),
    version: 0,
    actorId,
  });
  return { registerId, actorId };
}

describe("GET /changes carrying the register's own offline point of sale", () => {
  it("gives a register its own offline point of sale at its version", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await registerWithRealTime(locationId, "Caja 1", 7);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configureOffline({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    const pulled = await pullAfterSeed(deviceToken);

    expect(pulled.filter(({ entity }) => entity === "register_offline_point_of_sale")).toEqual([
      {
        entity: "register_offline_point_of_sale",
        entity_id: registerId,
        row: {
          point_of_sale_number: 8,
          tax_authority_last_authorized_number: null,
          highest_synced_offline_number: null,
          version: 1,
        },
      },
    ]);
  });

  it("gives the tax authority's last authorized number with the offline point of sale once it is recorded, at the same version", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await registerWithRealTime(locationId, "Caja 1", 7);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configureOffline({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 8,
      lastAuthorized: 41,
      readAt: NOW,
    });

    const pulled = await pullAfterSeed(deviceToken);
    expect(
      pulled.filter(({ entity }) => entity === "register_offline_point_of_sale").at(-1),
    ).toEqual({
      entity: "register_offline_point_of_sale",
      entity_id: registerId,
      row: {
        point_of_sale_number: 8,
        tax_authority_last_authorized_number: 41,
        highest_synced_offline_number: null,
        version: 1,
      },
    });
  });

  it("gives the highest offline number synced on the offline point of sale beside the tax authority's last authorized number, to an installation that pulls from the start", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await registerWithRealTime(locationId, "Caja 1", 7);
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configureOffline({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });
    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 8,
      lastAuthorized: 41,
      readAt: NOW,
    });
    await insertAppliedOfflineDocument(db, registerId, { pointOfSale: 8, number: 57 });
    await insertReceivedOfflineDocumentEvent(
      db,
      { deviceId, registerId },
      { pointOfSale: 8, number: 63 },
    );

    const pulled = await pullAfterSeed(deviceToken);

    expect(
      pulled.filter(({ entity }) => entity === "register_offline_point_of_sale").at(-1),
    ).toMatchObject({
      row: {
        point_of_sale_number: 8,
        tax_authority_last_authorized_number: 41,
        highest_synced_offline_number: 63,
      },
    });
  });

  it("gives no highest offline number while no document was synced on the offline point of sale", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await registerWithRealTime(locationId, "Caja 1", 7);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configureOffline({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    const pulled = await pullAfterSeed(deviceToken);

    expect(
      pulled.filter(({ entity }) => entity === "register_offline_point_of_sale").at(-1),
    ).toMatchObject({ row: { highest_synced_offline_number: null } });
  });

  it("gives the offline point of sale as it is now for every change logged for it", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await registerWithRealTime(locationId, "Caja 1", 7);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    const base = { locationId, registerId, actorId };
    await configureOffline({ ...base, pointOfSaleNumber: 8, version: 0 });
    await configureOffline({ ...base, pointOfSaleNumber: 9, version: 1 });

    const pulled = await pullAfterSeed(deviceToken);

    expect(pulled.filter(({ entity }) => entity === "register_offline_point_of_sale")).toEqual(
      Array(2).fill({
        entity: "register_offline_point_of_sale",
        entity_id: registerId,
        row: {
          point_of_sale_number: 9,
          tax_authority_last_authorized_number: null,
          highest_synced_offline_number: null,
          version: 2,
        },
      }),
    );
  });

  it("gives a register nothing of another register's offline point of sale, in its branch or in another", async () => {
    const locationId = await seededLocationId(db);
    const { registerId } = await registerWithRealTime(locationId, "Caja 1", 7);
    const sameBranch = await registerWithRealTime(locationId, "Caja 2", 9);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const otherLocationId = otherLocation.id;
    const otherBranch = await registerWithRealTime(otherLocationId, "Caja 3", 11);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configureOffline({
      locationId,
      registerId: sameBranch.registerId,
      actorId: sameBranch.actorId,
      pointOfSaleNumber: 10,
      version: 0,
    });
    await configureOffline({
      locationId: otherLocationId,
      registerId: otherBranch.registerId,
      actorId: otherBranch.actorId,
      pointOfSaleNumber: 12,
      version: 0,
    });

    const pulled = await pullAfterSeed(deviceToken);

    expect(pulled.filter(({ entity }) => entity === "register_offline_point_of_sale")).toEqual([]);
  });
});
