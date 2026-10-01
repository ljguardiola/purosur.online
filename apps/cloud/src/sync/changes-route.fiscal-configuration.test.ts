import { type ChangesPage, changesPageSchema } from "@purosur/contracts";
import {
  ANOTHER_FICTIONAL_CUIT,
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import {
  editIssuerIdentification,
  recordAuthorizedCuit,
  recordBuyerIdentificationThreshold,
} from "@purosur/domain/fiscal/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import { DrizzleBuyerIdentificationThresholdStore } from "../fiscal/drizzle-buyer-identification-threshold-store.js";
import { DrizzleIssuerIdentificationStore } from "../fiscal/drizzle-issuer-identification-store.js";
import {
  branchSettings,
  buyerTaxStatusSets,
  locations,
  registers,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { logChange } from "./change-log.js";
import { registerChangesRoute } from "./changes-route.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const AUTHORIZED_CUIT = FICTIONAL_CUIT;
const NEXT_AUTHORIZED_CUIT = ANOTHER_FICTIONAL_CUIT;
const SEEDED_CHANGES = 3;

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

async function pullFrom(since: number, deviceToken: string) {
  const response = await app.inject({
    method: "GET",
    url: `/changes?since=${since}`,
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  expect(response.statusCode).toBe(200);
  return changesPageSchema.parse(response.json());
}

function pullAfterSeed(deviceToken: string) {
  return pullFrom(SEEDED_CHANGES, deviceToken);
}

function withoutSeq(page: { changes: { change_seq: number }[] }) {
  return page.changes.map(({ change_seq, ...change }) => change);
}

async function insertActor(): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

async function insertRegisterOfAnotherBranch(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  await db
    .insert(branchSettings)
    .values({ locationId: location.id, priceListId: await seededPriceListId(db) });
  const [register] = await db
    .insert(registers)
    .values({ locationId: location.id, name: "Caja 2" })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the other branch's register returned no row");
  }
  return register.id;
}

async function insertTaxStatusSet(
  paramsVersion: number,
  options: { code: number; description: string; invoiceClass: string }[],
) {
  const [set] = await db
    .insert(buyerTaxStatusSets)
    .values({ paramsVersion, options })
    .returning({ id: buyerTaxStatusSets.id });
  if (!set) {
    throw new Error("test setup: seeding the tax-status set returned no row");
  }
  await logChange(db, {
    entity: "buyer_tax_status_set",
    entityId: set.id,
    version: paramsVersion,
    op: "insert",
  });
  return set.id;
}

function issuerPorts() {
  return { store: new DrizzleIssuerIdentificationStore(db) };
}

async function startUnder(authorizedCuit: string) {
  const outcome = await recordAuthorizedCuit(issuerPorts(), { authorizedCuit });
  if (outcome.kind !== "recorded") {
    throw new Error(`test setup: recording the CUIT ended as ${outcome.kind}`);
  }
}

async function editIssuer(actorId: string, version: number, legalName: string) {
  const outcome = await editIssuerIdentification(issuerPorts(), {
    legalName,
    grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activityStartDate: "2020-01-15",
    authorizedCuit: AUTHORIZED_CUIT,
    version,
    actorId,
  });
  if (outcome.kind !== "edited") {
    throw new Error(`test setup: editing the issuer identification ended as ${outcome.kind}`);
  }
}

function issuerRows(page: ChangesPage) {
  return page.changes.flatMap((change) =>
    change.entity === "issuer_identification" ? [change.row] : [],
  );
}

describe("GET /changes carrying the fiscal configuration", () => {
  it("gives a register the issuer identification under the CUIT the cloud started with, and nothing of the version kept from before", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);
    await startUnder(AUTHORIZED_CUIT);

    const page = await pullFrom(0, deviceToken);

    expect(issuerRows(page)).toEqual([
      {
        legal_name: null,
        gross_income_registration: null,
        activity_start_date: null,
        authorized_cuit: AUTHORIZED_CUIT,
        tax_status: "Responsable Monotributo",
        version: 2,
      },
    ]);
  });

  it("gives every version of the issuer identification as it was saved, even when several were saved between two pulls", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);
    const actorId = await insertActor();
    await startUnder(AUTHORIZED_CUIT);
    await editIssuer(actorId, 2, FICTIONAL_LEGAL_NAME);
    await editIssuer(actorId, 3, "Comercio de Prueba Nuevo");

    const page = await pullAfterSeed(deviceToken);

    expect(withoutSeq(page)).toMatchObject([
      { entity: "issuer_identification", row: { legal_name: null, version: 2 } },
      { entity: "issuer_identification", row: { legal_name: FICTIONAL_LEGAL_NAME, version: 3 } },
      {
        entity: "issuer_identification",
        row: { legal_name: "Comercio de Prueba Nuevo", version: 4 },
      },
    ]);
  });

  it("gives a new version under the new CUIT on the pull after the cloud starts with another certificate, the earlier versions keeping theirs", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);
    await startUnder(AUTHORIZED_CUIT);
    await editIssuer(await insertActor(), 2, FICTIONAL_LEGAL_NAME);
    const first = await pullFrom(0, deviceToken);

    await startUnder(NEXT_AUTHORIZED_CUIT);

    expect(issuerRows(await pullFrom(first.cursor, deviceToken))).toEqual([
      {
        legal_name: FICTIONAL_LEGAL_NAME,
        gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activity_start_date: "2020-01-15",
        authorized_cuit: NEXT_AUTHORIZED_CUIT,
        tax_status: "Responsable Monotributo",
        version: 4,
      },
    ]);
    expect(
      issuerRows(await pullFrom(0, deviceToken)).map(({ version, authorized_cuit }) => ({
        version,
        authorized_cuit,
      })),
    ).toEqual([
      { version: 2, authorized_cuit: AUTHORIZED_CUIT },
      { version: 3, authorized_cuit: AUTHORIZED_CUIT },
      { version: 4, authorized_cuit: NEXT_AUTHORIZED_CUIT },
    ]);
  });

  it("gives a threshold with its amount in cents and the day it starts, to a register of any branch", async () => {
    const otherBranch = await insertEnrolledInstallation(db, {
      existingRegisterId: await insertRegisterOfAnotherBranch(),
    });
    const ownBranch = await insertEnrolledInstallation(db);
    const outcome = await recordBuyerIdentificationThreshold(
      { store: new DrizzleBuyerIdentificationThresholdStore(db) },
      { amount: 3_500_000_000, validFrom: "2026-10-01", actorId: await insertActor() },
    );
    if (outcome.kind !== "recorded") {
      throw new Error(`test setup: recording ended as ${outcome.kind}`);
    }

    for (const { deviceToken } of [ownBranch, otherBranch]) {
      expect(withoutSeq(await pullAfterSeed(deviceToken))).toEqual([
        {
          entity: "buyer_identification_threshold",
          entity_id: outcome.threshold.id,
          row: { amount: 3_500_000_000, valid_from: "2026-10-01" },
        },
      ]);
    }
  });

  it("gives each buyer tax-status set with its version and its options in order, to a register of any branch", async () => {
    const otherBranch = await insertEnrolledInstallation(db, {
      existingRegisterId: await insertRegisterOfAnotherBranch(),
    });
    const ownBranch = await insertEnrolledInstallation(db);
    const options = [
      { code: 902, description: "Condicion de prueba B", invoiceClass: "C" },
      { code: 901, description: "Condicion de prueba A", invoiceClass: "A" },
    ];
    await insertTaxStatusSet(1, options);
    await insertTaxStatusSet(2, options.slice(1));

    for (const { deviceToken } of [ownBranch, otherBranch]) {
      expect(withoutSeq(await pullAfterSeed(deviceToken))).toMatchObject([
        {
          entity: "buyer_tax_status_set",
          row: {
            params_version: 1,
            options: [
              { code: 902, description: "Condicion de prueba B", invoice_class: "C" },
              { code: 901, description: "Condicion de prueba A", invoice_class: "A" },
            ],
          },
        },
        {
          entity: "buyer_tax_status_set",
          row: {
            params_version: 2,
            options: [{ code: 901, description: "Condicion de prueba A", invoice_class: "A" }],
          },
        },
      ]);
    }
  });

  it("gives nothing more once the register has every fiscal change", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);
    await insertTaxStatusSet(1, [
      { code: 901, description: "Condicion de prueba A", invoiceClass: "A" },
    ]);
    const first = await pullAfterSeed(deviceToken);

    const next = await pullFrom(first.cursor, deviceToken);

    expect(next.changes).toEqual([]);
  });
});
