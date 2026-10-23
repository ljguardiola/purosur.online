import {
  cloudErrorSchema,
  type UnclearOutcomeQuestionBody,
  unclearOutcomeAnswerSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { fiscalRequests, inbox, installationRequestAttempts } from "../platform/db/schema.js";
import type { reportError } from "../platform/error-reporting.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { registerEventsRoute } from "../sync/events-route.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import {
  cashSessionOpened,
  PUSHING_CHAIN_KEY,
  pushingDevice,
  saleCompleted,
} from "../sync/test-support/pushing-device.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
  insertSaleOfRegister,
  saleCompletedEvent,
} from "./test-support/authorization-request-fixtures.js";
import { registerUnclearOutcomeRoute } from "./unclear-outcome-route.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");

let testDatabase: TestDatabase;
let app: FastifyInstance;
let enqueuedUnclearOutcomes: string[];
let report: Mock<typeof reportError>;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  enqueuedUnclearOutcomes = [];
  report = vi.fn<typeof reportError>();
  app = Fastify();
  registerRouteAccess(app);
  registerUnclearOutcomeRoute(app, {
    db: testDatabase.db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
    connections: { withConnection: (work) => work(testDatabase.db) },
    enqueueUnclearOutcome: async (_, fiscalDocumentId) => {
      enqueuedUnclearOutcomes.push(fiscalDocumentId);
    },
    enqueueCreditNote: async () => {},
    enqueueEventApplication: async () => {},
    report,
  });
  registerEventsRoute(app, {
    db: testDatabase.db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
    enqueueEventApplication: async () => {},
  });
});

afterEach(async () => {
  await app.close();
});

function questionBody(overrides: Partial<UnclearOutcomeQuestionBody> = {}) {
  const saleId = overrides.sale_id ?? crypto.randomUUID();
  return {
    fiscal_document_id: crypto.randomUUID(),
    sale_id: saleId,
    point_of_sale: 7,
    number: 42,
    issued_on: "2026-10-06",
    total: 1500,
    buyer_tax_status_code: 5,
    sale_event: saleCompletedEvent(saleId),
    ...overrides,
  };
}

async function enrollRegisterWithPointOfSale(pointOfSaleNumber = 7) {
  const registerId = await insertRegisterWithPointOfSale(testDatabase.db, {
    pointOfSaleNumber,
    name: `caja-${pointOfSaleNumber}`,
  });
  return insertEnrolledInstallation(testDatabase.db, { now: NOW, existingRegisterId: registerId });
}

function ask(payload: unknown, authorization?: string) {
  return app.inject({
    method: "POST",
    url: "/fiscal/unclear-outcomes",
    payload: payload as object,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

async function seedUnclearRequest(
  registerId: string,
  fiscalDocumentId: string,
  decision: Partial<typeof fiscalRequests.$inferInsert> = {},
) {
  await testDatabase.db.insert(fiscalRequests).values({
    ...authorizationRequestRecord(registerId, { fiscalDocumentId }),
    answerKind: "unclear",
    unclearCodes: [],
    answeredAt: NOW,
    ...decision,
  });
}

async function requests() {
  return testDatabase.db.select().from(fiscalRequests);
}

describe("POST /fiscal/unclear-outcomes", () => {
  describe("who may ask", () => {
    it("refuses a question that carries no device token, recording nothing", async () => {
      const response = await ask(questionBody());

      expect(response.statusCode).toBe(401);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
      expect(await requests()).toEqual([]);
    });

    it("refuses a revoked installation", async () => {
      await enrollRegisterWithPointOfSale();
      const revoked = await insertEnrolledInstallation(testDatabase.db, {
        now: NOW,
        revokedAt: new Date(NOW.getTime() - 1_000),
      });

      const response = await ask(questionBody(), `Bearer ${revoked.deviceToken}`);

      expect(response.statusCode).toBe(403);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("revoked");
      expect(await requests()).toEqual([]);
    });

    it("refuses a point of sale that belongs to another register, recording nothing", async () => {
      await enrollRegisterWithPointOfSale(7);
      const other = await enrollRegisterWithPointOfSale(8);

      const response = await ask(questionBody({ point_of_sale: 7 }), `Bearer ${other.deviceToken}`);

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
      expect(await requests()).toEqual([]);
    });

    it("refuses a fiscal document another register recorded", async () => {
      const owner = await enrollRegisterWithPointOfSale(7);
      const other = await enrollRegisterWithPointOfSale(8);
      const body = questionBody({ point_of_sale: 8 });
      await seedUnclearRequest(owner.registerId, body.fiscal_document_id);

      const response = await ask(body, `Bearer ${other.deviceToken}`);

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
    });
  });

  describe("how many questions an installation may ask", () => {
    it("records each admitted question as a question about an unclear outcome of its installation", async () => {
      const { deviceId, deviceToken } = await enrollRegisterWithPointOfSale();

      await ask(questionBody(), `Bearer ${deviceToken}`);

      expect(
        await testDatabase.db
          .select({ endpoint: installationRequestAttempts.endpoint })
          .from(installationRequestAttempts)
          .where(eq(installationRequestAttempts.deviceId, deviceId)),
      ).toEqual([{ endpoint: "fiscal_unclear_outcome" }]);
    });

    it("refuses a question past the installation's limit before reading its body, recording nothing", async () => {
      const { deviceId, deviceToken } = await enrollRegisterWithPointOfSale();
      await insertRequestsUpToLimit(testDatabase.db, deviceId, "fiscal_unclear_outcome", NOW);

      const response = await ask({ number: "forty-two" }, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(429);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("rate_limited");
      expect(await requests()).toEqual([]);
    });
  });

  describe("what it reads", () => {
    it("refuses a body that is not a question about an unclear outcome", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();

      const response = await ask({ number: "forty-two" }, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(await requests()).toEqual([]);
    });

    it("refuses an event that is not the completion of the document's sale", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();

      const response = await ask(
        { ...questionBody(), sale_event: saleCompletedEvent(crypto.randomUUID()) },
        `Bearer ${deviceToken}`,
      );

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(await requests()).toEqual([]);
    });
  });

  describe("a question that carries no sale event", () => {
    it("is refused when the cloud holds no completion of the sale for the register, recording nothing", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();

      const response = await ask(questionBody({ sale_event: null }), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
      expect(await requests()).toEqual([]);
      expect(enqueuedUnclearOutcomes).toEqual([]);
    });

    it("uses the completion the cloud holds: records the document as abandoned without an event and answers PENDING", async () => {
      const { deviceToken, registerId } = await enrollRegisterWithPointOfSale();
      const body = questionBody({ sale_event: null });
      await insertSaleOfRegister(testDatabase.db, registerId, body.sale_id);

      const response = await ask(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(unclearOutcomeAnswerSchema.parse(response.json())).toEqual({ state: "PENDING" });
      expect(await requests()).toEqual([
        expect.objectContaining({
          fiscalDocumentId: body.fiscal_document_id,
          registerId,
          saleEvent: null,
          answerKind: "unclear",
        }),
      ]);
    });
  });

  describe("what it answers", () => {
    it("records a document it has no record of as abandoned, enqueues its decision and answers PENDING", async () => {
      const { deviceToken, registerId } = await enrollRegisterWithPointOfSale();
      const body = questionBody();

      const response = await ask(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(unclearOutcomeAnswerSchema.parse(response.json())).toEqual({ state: "PENDING" });
      expect(await requests()).toEqual([
        expect.objectContaining({
          fiscalDocumentId: body.fiscal_document_id,
          registerId,
          saleEvent: body.sale_event,
          answerKind: "unclear",
          answeredAt: NOW,
          decision: null,
        }),
      ]);
      expect(enqueuedUnclearOutcomes).toEqual([body.fiscal_document_id]);
    });

    it("answers PENDING for a recorded document still without a decision", async () => {
      const { deviceToken, registerId } = await enrollRegisterWithPointOfSale();
      const body = questionBody();
      await seedUnclearRequest(registerId, body.fiscal_document_id);

      const response = await ask(body, `Bearer ${deviceToken}`);

      expect(unclearOutcomeAnswerSchema.parse(response.json())).toEqual({ state: "PENDING" });
    });

    it.each([
      [{ decision: "released" as const }, { state: "RELEASED" }],
      [
        {
          decision: "adopted" as const,
          adoptedAuthorizationCode: "74123456789012",
          adoptedAuthorizationCodeDueOn: "2026-10-16",
        },
        {
          state: "ADOPTED",
          authorization_code: "74123456789012",
          authorization_code_due_on: "2026-10-16",
        },
      ],
      [{ decision: "conflicting" as const }, { state: "CONFLICTING" }],
    ])("answers the decision recorded for the document: %o", async (decision, answer) => {
      const { deviceToken, registerId } = await enrollRegisterWithPointOfSale();
      const body = questionBody();
      await seedUnclearRequest(registerId, body.fiscal_document_id, {
        ...decision,
        decidedAt: NOW,
      });

      const response = await ask(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(unclearOutcomeAnswerSchema.parse(response.json())).toEqual(answer);
    });

    it.each([
      [
        {
          answerKind: "authorized" as const,
          authorizationCode: "74123456789012",
          authorizationCodeDueOn: "2026-10-16",
        },
        {
          state: "AUTHORIZED",
          authorization_code: "74123456789012",
          authorization_code_due_on: "2026-10-16",
        },
      ],
      [
        {
          answerKind: "rejected" as const,
          rejectionCodes: [10015],
          rejectionClass: "content" as const,
        },
        { state: "REJECTED", rejection_codes: [10015], rejection_class: "content" },
      ],
    ])(
      "answers the tax authority's clear answer the register missed: %o",
      async (clearAnswer, answer) => {
        const { deviceToken, registerId } = await enrollRegisterWithPointOfSale();
        const body = questionBody();
        await seedUnclearRequest(registerId, body.fiscal_document_id, {
          ...clearAnswer,
          unclearCodes: null,
        });

        const response = await ask(body, `Bearer ${deviceToken}`);

        expect(response.statusCode).toBe(200);
        expect(unclearOutcomeAnswerSchema.parse(response.json())).toEqual(answer);
        expect(await requests()).toEqual([expect.objectContaining({ decision: null })]);
      },
    );
  });

  describe("the sale event a question carries", () => {
    async function installationPushingSales() {
      const registerId = await insertRegisterWithPointOfSale(testDatabase.db, {
        pointOfSaleNumber: 7,
        name: "caja-7",
      });
      const installation = await insertEnrolledInstallation(testDatabase.db, {
        now: NOW,
        existingRegisterId: registerId,
        outboxChainKey: PUSHING_CHAIN_KEY,
      });
      return { installation, device: pushingDevice(app, installation.deviceToken) };
    }

    function chainedSale(device: ReturnType<typeof pushingDevice>) {
      const sessionId = crypto.randomUUID();
      const saleId = crypto.randomUUID();
      const events = device.chain([
        cashSessionOpened(sessionId, "2026-10-06T11:00:00.000Z"),
        saleCompleted({
          saleId,
          sessionId,
          completedAt: "2026-10-06T11:20:00.000Z",
          total: 1500,
          payments: [{ amount: 1500 }],
        }),
      ]);
      return { saleId, events };
    }

    it("is held in the inbox of the asking installation", async () => {
      const { installation, device } = await installationPushingSales();
      const { saleId, events } = chainedSale(device);

      const response = await ask(
        questionBody({ sale_id: saleId, sale_event: events[1] ?? null }),
        `Bearer ${installation.deviceToken}`,
      );

      expect(response.statusCode).toBe(200);
      const held = await testDatabase.db.select().from(inbox);
      expect(held).toHaveLength(1);
      expect(held[0]).toMatchObject({
        deviceId: installation.deviceId,
        deviceSeq: 2,
        eventId: events[1]?.event_id,
        appliedAt: null,
      });
    });

    it("leaves one row when the same question is asked again", async () => {
      const { installation, device } = await installationPushingSales();
      const { saleId, events } = chainedSale(device);
      const body = questionBody({ sale_id: saleId, sale_event: events[1] ?? null });

      await ask(body, `Bearer ${installation.deviceToken}`);
      const again = await ask(body, `Bearer ${installation.deviceToken}`);

      expect(again.statusCode).toBe(200);
      expect(await testDatabase.db.select().from(inbox)).toHaveLength(1);
    });

    it("reports an event the inbox refuses for a broken chain, with how it was refused", async () => {
      const { installation, device } = await installationPushingSales();
      const { saleId, events } = chainedSale(device);
      const renumberedFirst = { ...(events[1] ?? saleCompletedEvent(saleId)), device_seq: 1 };

      await ask(
        questionBody({ sale_id: saleId, sale_event: renumberedFirst }),
        `Bearer ${installation.deviceToken}`,
      );

      expect(report).toHaveBeenCalledWith(expect.any(String), expect.any(Error), {
        context: {
          deviceId: installation.deviceId,
          eventId: renumberedFirst.event_id,
          outcome: "chain_broken",
        },
      });
    });

    it("reports an event the inbox refuses as held at another position, with how it was refused", async () => {
      const { installation, device } = await installationPushingSales();
      const { saleId, events } = chainedSale(device);
      const saleEvent = events[1] ?? saleCompletedEvent(saleId);
      await ask(
        questionBody({ sale_id: saleId, sale_event: saleEvent }),
        `Bearer ${installation.deviceToken}`,
      );

      await ask(
        questionBody({ sale_id: saleId, sale_event: { ...saleEvent, device_seq: 3 } }),
        `Bearer ${installation.deviceToken}`,
      );

      expect(report).toHaveBeenCalledWith(expect.any(String), expect.any(Error), {
        context: {
          deviceId: installation.deviceId,
          eventId: saleEvent.event_id,
          outcome: "misplaced",
        },
      });
    });

    it("reports nothing of an event the inbox holds, the first time or again", async () => {
      const { installation, device } = await installationPushingSales();
      const { saleId, events } = chainedSale(device);
      const body = questionBody({ sale_id: saleId, sale_event: events[1] ?? null });

      await ask(body, `Bearer ${installation.deviceToken}`);
      await ask(body, `Bearer ${installation.deviceToken}`);

      expect(report).not.toHaveBeenCalled();
    });

    it("holds nothing when the question carries none", async () => {
      const { installation } = await installationPushingSales();
      const saleId = crypto.randomUUID();
      await insertSaleOfRegister(testDatabase.db, installation.registerId, saleId);

      await ask(
        questionBody({ sale_id: saleId, sale_event: null }),
        `Bearer ${installation.deviceToken}`,
      );

      expect(await testDatabase.db.select().from(inbox)).toEqual([]);
    });
  });
});
