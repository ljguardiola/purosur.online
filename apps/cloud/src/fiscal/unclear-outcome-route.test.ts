import {
  cloudErrorSchema,
  type UnclearOutcomeQuestionBody,
  unclearOutcomeAnswerSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fiscalRequests, installationRequestAttempts } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
  saleCompletedEvent,
} from "./test-support/authorization-request-fixtures.js";
import { registerUnclearOutcomeRoute } from "./unclear-outcome-route.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");

let testDatabase: TestDatabase;
let app: FastifyInstance;
let enqueuedUnclearOutcomes: string[];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  enqueuedUnclearOutcomes = [];
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
    enqueueOrphanCreditNote: async () => {},
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
});
