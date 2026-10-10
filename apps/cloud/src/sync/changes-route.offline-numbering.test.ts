import { type ChangesPage, changesPageSchema } from "@purosur/contracts";
import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleOfflineAuthorizationCodeStore } from "../fiscal/drizzle-offline-authorization-code-store.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "../fiscal/drizzle-register-offline-point-of-sale-store.js";
import { DrizzleRegisterPointOfSaleStore } from "../fiscal/drizzle-register-point-of-sale-store.js";
import { fiscalAddresses, registers, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerChangesRoute } from "./changes-route.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const SEPTEMBER_SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };
const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
const enqueueRequest = vi.fn<() => Promise<void>>();

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  enqueueRequest.mockReset();
  enqueueRequest.mockResolvedValue(undefined);
  app = Fastify();
  registerRouteAccess(app);
  registerChangesRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
    enqueueOfflineAuthorizationCodeRequest: enqueueRequest,
  });
});

afterEach(async () => {
  await app.close();
});

async function pull(deviceToken: string): Promise<ChangesPage["changes"]> {
  const response = await app.inject({
    method: "GET",
    url: "/changes?since=0",
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  expect(response.statusCode).toBe(200);
  return changesPageSchema.parse(response.json()).changes;
}

async function pulledRows(deviceToken: string, entity: string) {
  return (await pull(deviceToken))
    .filter((change) => change.entity === entity)
    .map((change) => ("row" in change ? change.row : undefined));
}

async function keepCode(
  fortnight: { start: string; end: string },
  code: string,
  reportDeadline: string,
) {
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code, fortnight, reportDeadline },
      obtainedAt: NOW,
      obtainedThrough: "requested",
    }),
  );
}

async function registerWithOfflinePointOfSale(name: string, realTime: number, offline: number) {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: `${name}@example.com`, locationId })
    .returning({ id: users.id });
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: `Deposito ${name}`, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!actor || !register || !fiscalAddress) {
    throw new Error("test setup: seeding returned no row");
  }
  const base = { locationId, registerId: register.id, actorId: actor.id };
  await configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db, () => NOW), {
    ...base,
    pointOfSaleNumber: realTime,
    fiscalAddressId: fiscalAddress.id,
    version: 0,
  });
  await configureRegisterOfflinePointOfSale(
    new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOW),
    { ...base, pointOfSaleNumber: offline, version: 0 },
  );
  const { deviceToken } = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: register.id,
  });
  return { ...base, deviceToken };
}

describe("GET /changes carrying the offline authorization codes", () => {
  it("gives a register every code with the fortnight it covers and its report deadline", async () => {
    await keepCode(SEPTEMBER_SECOND_HALF, "36123456789012", "2026-10-12");
    await keepCode(OCTOBER_FIRST_HALF, "36123456789013", "2026-10-27");
    const { deviceToken } = await registerWithOfflinePointOfSale("Caja 1", 7, 8);

    expect(await pulledRows(deviceToken, "offline_authorization_code")).toEqual([
      {
        fortnight_start: "2026-09-16",
        fortnight_end: "2026-09-30",
        code: "36123456789012",
        report_deadline: "2026-10-12",
        version: 1,
      },
      {
        fortnight_start: "2026-10-01",
        fortnight_end: "2026-10-15",
        code: "36123456789013",
        report_deadline: "2026-10-27",
        version: 1,
      },
    ]);
  });

  it("gives the same codes to every register", async () => {
    await keepCode(SEPTEMBER_SECOND_HALF, "36123456789012", "2026-10-12");
    const first = await registerWithOfflinePointOfSale("Caja 1", 7, 8);
    const second = await registerWithOfflinePointOfSale("Caja 2", 9, 10);

    expect(await pulledRows(second.deviceToken, "offline_authorization_code")).toEqual(
      await pulledRows(first.deviceToken, "offline_authorization_code"),
    );
    expect(await pulledRows(first.deviceToken, "offline_authorization_code")).toHaveLength(1);
  });
});

describe("GET /changes carrying the offline number blocks", () => {
  it("gives a register the block of its own offline point of sale with its range and status", async () => {
    const { deviceToken } = await registerWithOfflinePointOfSale("Caja 1", 7, 8);

    expect(await pulledRows(deviceToken, "offline_number_block")).toEqual([
      {
        point_of_sale_number: 8,
        document_type: "factura_c",
        first_number: 1,
        last_number: 1000,
        status: "in_use",
        version: 1,
      },
    ]);
  });

  it("gives a register nothing of another register's blocks", async () => {
    const first = await registerWithOfflinePointOfSale("Caja 1", 7, 8);
    const second = await registerWithOfflinePointOfSale("Caja 2", 9, 10);

    expect(await pulledRows(first.deviceToken, "offline_number_block")).toMatchObject([
      { point_of_sale_number: 8 },
    ]);
    expect(await pulledRows(second.deviceToken, "offline_number_block")).toMatchObject([
      { point_of_sale_number: 10 },
    ]);
  });
});

describe("GET /changes asking for the current fortnight's offline authorization code", () => {
  it("requests it while the cloud holds none for the fortnight the register is in", async () => {
    const { deviceToken } = await registerWithOfflinePointOfSale("Caja 1", 7, 8);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789013", "2026-10-27");

    await pull(deviceToken);

    expect(enqueueRequest).toHaveBeenCalledTimes(1);
  });

  it("requests nothing once the cloud holds the current fortnight's code", async () => {
    const { deviceToken } = await registerWithOfflinePointOfSale("Caja 1", 7, 8);
    await keepCode(SEPTEMBER_SECOND_HALF, "36123456789012", "2026-10-12");

    await pull(deviceToken);

    expect(enqueueRequest).not.toHaveBeenCalled();
  });

  it("still answers when the cloud has no way to request codes", async () => {
    const quiet = Fastify();
    registerRouteAccess(quiet);
    registerChangesRoute(quiet, {
      db,
      rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      now: () => NOW,
    });
    const { deviceToken } = await registerWithOfflinePointOfSale("Caja 1", 7, 8);

    const response = await quiet.inject({
      method: "GET",
      url: "/changes?since=0",
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    await quiet.close();

    expect(response.statusCode).toBe(200);
  });
});
