import { cloudErrorSchema, restoredRegisterOrphanSweepResponseSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  creditNotes,
  fiscalRequests,
  fiscalTasks,
  numberingFreezes,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerRestoredRegisterOrphanSweepRoute } from "./restored-register-orphan-sweep-route.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
  RECEIVED_AT,
} from "./test-support/authorization-request-fixtures.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";

const NOW = new Date("2026-10-22T12:00:00.000Z");

const AUTHORIZED: Partial<typeof fiscalRequests.$inferInsert> = {
  answerKind: "authorized",
  authorizationCode: "74123456789012",
  authorizationCodeDueOn: "2026-10-16",
  answeredAt: RECEIVED_AT,
};

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let connectionsOpened: number;
let enqueued: string[];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  connectionsOpened = 0;
  enqueued = [];
  app = Fastify();
  registerRouteAccess(app);
  registerRestoredRegisterOrphanSweepRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
    connections: {
      withConnection: (work) => {
        connectionsOpened += 1;
        return work(db);
      },
    },
    enqueueCreditNote: async (_, creditNoteId) => {
      enqueued.push(creditNoteId);
    },
  });
});

afterEach(async () => {
  await app.close();
});

function sweep(authorization?: string) {
  return app.inject({
    method: "POST",
    url: "/devices/current/orphan-sweep",
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

async function aRegister(pointOfSaleNumber: number) {
  const registerId = await insertRegisterWithPointOfSale(db, {
    pointOfSaleNumber,
    name: `caja-${pointOfSaleNumber}`,
  });
  const installation = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: registerId,
  });
  return { registerId, bearer: `Bearer ${installation.deviceToken}` };
}

async function recordRequest(
  registerId: string,
  pointOfSale: number,
  number: number,
  columns: Partial<typeof fiscalRequests.$inferInsert> = AUTHORIZED,
) {
  const request = authorizationRequestRecord(registerId, { pointOfSale, number });
  await db.insert(fiscalRequests).values({ ...request, ...columns });
  return request;
}

describe("POST /devices/current/orphan-sweep", () => {
  describe("who may ask", () => {
    it.each([
      ["without a device token", undefined],
      ["with a token that is not recognized", "Bearer nope.nope"],
    ])(
      "refuses a request %s, reading none of the register's fiscal data",
      async (_case, header) => {
        const { registerId } = await aRegister(7);
        await recordRequest(registerId, 7, 41);

        const response = await sweep(header);

        expect(response.statusCode).toBe(401);
        expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
        expect(connectionsOpened).toBe(0);
        expect(await db.select().from(fiscalTasks)).toEqual([]);
      },
    );

    it("refuses the token of a revoked installation, reading none of the register's fiscal data", async () => {
      const { registerId } = await aRegister(7);
      await recordRequest(registerId, 7, 41);
      const revoked = await insertEnrolledInstallation(db, {
        now: NOW,
        existingRegisterId: registerId,
        revokedAt: new Date(NOW.getTime() - 1_000),
      });

      const response = await sweep(`Bearer ${revoked.deviceToken}`);

      expect(response.statusCode).toBe(401);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
      expect(connectionsOpened).toBe(0);
      expect(await db.select().from(fiscalTasks)).toEqual([]);
    });
  });

  describe("what the sweep answers", () => {
    it("requests the credit note of an authorized request whose sale has another receipt", async () => {
      const { registerId, bearer } = await aRegister(7);
      const orphan = await recordRequest(registerId, 7, 41);
      await insertOfflineFiscalDocument(db, {
        registerId,
        saleId: orphan.saleId,
        pointOfSale: 9,
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        number: 3,
      });

      const response = await sweep(bearer);

      expect(response.statusCode).toBe(200);
      expect(restoredRegisterOrphanSweepResponseSchema.parse(response.json())).toEqual({
        state: "SWEPT",
        credit_noted_numbers: [41],
        alerted_numbers: [],
      });
      const rows = await db.select().from(creditNotes);
      expect(rows.map(({ saleId, associatedNumber }) => ({ saleId, associatedNumber }))).toEqual([
        { saleId: orphan.saleId, associatedNumber: 41 },
      ]);
      expect(enqueued).toEqual(rows.map(({ id }) => id));
    });

    it("opens an alert and a task for an authorized request with no sale and no other receipt", async () => {
      const { registerId, bearer } = await aRegister(7);
      await recordRequest(registerId, 7, 41);

      const response = await sweep(bearer);

      expect(restoredRegisterOrphanSweepResponseSchema.parse(response.json())).toEqual({
        state: "SWEPT",
        credit_noted_numbers: [],
        alerted_numbers: [41],
      });
      expect((await db.select().from(fiscalTasks)).map(({ number }) => number)).toEqual([41]);
      expect(await db.select().from(alerts)).toHaveLength(1);
      expect(await db.select().from(creditNotes)).toEqual([]);
    });

    it("finds nothing and records nothing when no request lacks its sale", async () => {
      const { bearer } = await aRegister(7);

      const response = await sweep(bearer);

      expect(response.statusCode).toBe(200);
      expect(restoredRegisterOrphanSweepResponseSchema.parse(response.json())).toEqual({
        state: "SWEPT",
        credit_noted_numbers: [],
        alerted_numbers: [],
      });
      expect(await db.select().from(fiscalTasks)).toEqual([]);
      expect(await db.select().from(creditNotes)).toEqual([]);
    });

    it("sweeps nothing of another register's point of sale", async () => {
      const { bearer } = await aRegister(7);
      const other = await aRegister(8);
      await recordRequest(other.registerId, 8, 41);

      const response = await sweep(bearer);

      expect(restoredRegisterOrphanSweepResponseSchema.parse(response.json())).toEqual({
        state: "SWEPT",
        credit_noted_numbers: [],
        alerted_numbers: [],
      });
      expect(await db.select().from(fiscalTasks)).toEqual([]);
    });

    it("answers that the numbering is not reconciled, recording nothing, while the point of sale is frozen", async () => {
      const { registerId, bearer } = await aRegister(7);
      await recordRequest(registerId, 7, 41);
      await db
        .insert(numberingFreezes)
        .values({ pointOfSaleNumber: 7, countBeforeFreeze: 3, frozenAt: RECEIVED_AT });

      const response = await sweep(bearer);

      expect(response.statusCode).toBe(200);
      expect(restoredRegisterOrphanSweepResponseSchema.parse(response.json())).toEqual({
        state: "NUMBERING_NOT_RECONCILED",
      });
      expect(await db.select().from(fiscalTasks)).toEqual([]);
    });

    it("sweeps a second time without opening a second task", async () => {
      const { registerId, bearer } = await aRegister(7);
      await recordRequest(registerId, 7, 41);

      await sweep(bearer);
      const second = await sweep(bearer);

      expect(restoredRegisterOrphanSweepResponseSchema.parse(second.json())).toEqual({
        state: "SWEPT",
        credit_noted_numbers: [],
        alerted_numbers: [],
      });
      expect(await db.select().from(fiscalTasks)).toHaveLength(1);
    });
  });
});
