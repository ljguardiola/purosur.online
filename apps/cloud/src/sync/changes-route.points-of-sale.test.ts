import { type ChangesPage, changesPageSchema } from "@purosur/contracts";
import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import { DrizzleRegisterPointOfSaleStore } from "../fiscal/drizzle-register-point-of-sale-store.js";
import { fiscalAddresses, locations, registers, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerChangesRoute } from "./changes-route.js";

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
  app = Fastify();
  registerRouteAccess(app);
  registerChangesRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

async function pullAfterSeed(deviceToken: string) {
  const response = await app.inject({
    method: "GET",
    url: `/changes?since=${SEEDED_CHANGES}`,
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  expect(response.statusCode).toBe(200);
  const page: ChangesPage = changesPageSchema.parse(response.json());
  return page.changes.map(({ change_seq, ...change }) => change);
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

async function insertFiscalAddress(): Promise<string> {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!fiscalAddress) {
    throw new Error("test setup: seeding the fiscal address returned no row");
  }
  return fiscalAddress.id;
}

async function configure(input: {
  locationId: string;
  registerId: string;
  pointOfSaleNumber: number;
  fiscalAddressId: string;
  version: number;
  actorId: string;
}) {
  const outcome = await configureRegisterPointOfSale(
    new DrizzleRegisterPointOfSaleStore(db, () => NOW),
    input,
  );
  if (outcome.kind !== "configured") {
    throw new Error(`test setup: configuring ended as ${outcome.kind}`);
  }
}

async function otherBranchRegister(): Promise<{ locationId: string; registerId: string }> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  return { locationId: location.id, registerId: await insertRegister(location.id, "Caja 3") };
}

describe("GET /changes carrying the register's own point of sale", () => {
  it("gives a register its own point of sale and fiscal address, at its version", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configure({
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId: await insertActor(locationId),
    });

    expect(await pullAfterSeed(deviceToken)).toEqual([
      {
        entity: "register_point_of_sale",
        entity_id: registerId,
        row: { point_of_sale_number: 7, fiscal_address_id: fiscalAddressId, version: 1 },
      },
    ]);
  });

  it("gives a register nothing of another register's point of sale, in its branch or in another", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const sameBranchRegisterId = await insertRegister(locationId, "Caja 2");
    const otherBranch = await otherBranchRegister();
    const fiscalAddressId = await insertFiscalAddress();
    const actorId = await insertActor(locationId);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await configure({
      locationId,
      registerId: sameBranchRegisterId,
      pointOfSaleNumber: 8,
      fiscalAddressId,
      version: 0,
      actorId,
    });
    await configure({
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
    const registerId = await insertRegister(locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const actorId = await insertActor(locationId);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    const base = { locationId, registerId, fiscalAddressId, actorId };
    await configure({ ...base, pointOfSaleNumber: 7, version: 0 });
    await configure({ ...base, pointOfSaleNumber: 8, version: 1 });

    const pulled = await pullAfterSeed(deviceToken);

    expect(pulled).toEqual([
      {
        entity: "register_point_of_sale",
        entity_id: registerId,
        row: { point_of_sale_number: 8, fiscal_address_id: fiscalAddressId, version: 2 },
      },
      {
        entity: "register_point_of_sale",
        entity_id: registerId,
        row: { point_of_sale_number: 8, fiscal_address_id: fiscalAddressId, version: 2 },
      },
    ]);
  });
});
