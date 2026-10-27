import { cloudErrorSchema, registerResetResponseSchema } from "@purosur/contracts";
import { desc } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authorizationRequestRecord } from "../fiscal/test-support/authorization-request-fixtures.js";
import {
  ANSWERED_AT,
  anAuthorizedAnswer,
  aRejectedAnswer,
  insertSaleCreditNote,
  REQUESTED_AT,
} from "../fiscal/test-support/sale-credit-notes.js";
import {
  fiscalRequests,
  inbox,
  offlineFiscalDocuments,
  roles,
  saleCreditNoteRefusals,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerDeviceResetRoute } from "./device-reset-route.js";
import { type InboxEventValues, insertInboxEvent } from "./test-support/inbox-events.js";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const URL = "/devices/current/reset";

let nextRequestNumber = 1;
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
  registerDeviceResetRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function reset(body: unknown, authorization?: string) {
  return app.inject({
    method: "POST",
    url: URL,
    ...(authorization !== undefined && { headers: { authorization } }),
    payload: body as Record<string, unknown>,
  });
}

async function aRestoredRegister() {
  const predecessor = await insertEnrolledInstallation(db, {
    now: NOW,
    revokedAt: new Date("2026-10-19T12:00:00.000Z"),
  });
  const current = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: predecessor.registerId,
  });
  return { predecessor, current };
}

describe("POST /devices/current/reset", () => {
  it.each([
    ["without a device token", undefined],
    ["with a token that is not recognized", "Bearer nope.nope"],
  ])("refuses a request %s", async (_name, authorization) => {
    const response = await reset(
      { predecessor_device_id: crypto.randomUUID(), last_acknowledged_seq: 0 },
      authorization,
    );

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses the token of a revoked installation", async () => {
    const { predecessor } = await aRestoredRegister();

    const response = await reset(
      { predecessor_device_id: predecessor.deviceId, last_acknowledged_seq: 0 },
      `Bearer ${predecessor.deviceToken}`,
    );

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses a body that is not a reset request", async () => {
    const { current } = await aRestoredRegister();

    const response = await reset({ last_acknowledged_seq: 0 }, `Bearer ${current.deviceToken}`);

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
  });

  it("answers a conflict for a predecessor that belongs to another register", async () => {
    const { current } = await aRestoredRegister();
    const other = await insertEnrolledInstallation(db, {
      now: NOW,
      revokedAt: new Date("2026-10-19T12:00:00.000Z"),
      registerName: "Caja 2",
    });

    const response = await reset(
      { predecessor_device_id: other.deviceId, last_acknowledged_seq: 0 },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("predecessor_not_of_register");
  });

  it("answers a conflict for a predecessor that is not revoked", async () => {
    const { current } = await aRestoredRegister();

    const response = await reset(
      { predecessor_device_id: current.deviceId, last_acknowledged_seq: 0 },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("predecessor_not_revoked");
  });

  it("answers a conflict for a cursor that names an installation outside the replenishment", async () => {
    const { predecessor, current } = await aRestoredRegister();
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });

    const response = await reset(
      {
        predecessor_device_id: predecessor.deviceId,
        last_acknowledged_seq: 0,
        after: { device_id: other.deviceId, device_seq: 1 },
      },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("cursor_not_of_replenishment");
  });

  it("answers the events above the position and the branch's users", async () => {
    const { predecessor, current } = await aRestoredRegister();
    await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 1 });
    const eventId = await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 2 });
    const [user] = await db
      .insert(users)
      .values({ firstName: "Ana", email: "ana@example.com", locationId: current.locationId })
      .returning({ id: users.id });
    const [role] = await db.select({ id: roles.id }).from(roles).limit(1);
    if (!user || !role) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id });

    const response = await reset(
      { predecessor_device_id: predecessor.deviceId, last_acknowledged_seq: 1 },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(200);
    const body = registerResetResponseSchema.parse(response.json());
    expect(body.events.map(({ event_id }) => event_id)).toEqual([eventId]);
    expect(body.events.map(({ device_id }) => device_id)).toEqual([predecessor.deviceId]);
    expect(body.next).toBeNull();
    expect(body.users).toEqual([
      {
        user_id: user.id,
        first_name: "Ana",
        role_id: role.id,
        salt: null,
        pin_hash: null,
        active: true,
        version: 1,
      },
    ]);
  });

  it("continues after the event the cursor names", async () => {
    const { predecessor, current } = await aRestoredRegister();
    await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 1 });
    await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 2 });
    const third = await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 3 });

    const response = await reset(
      {
        predecessor_device_id: predecessor.deviceId,
        last_acknowledged_seq: 0,
        after: { device_id: predecessor.deviceId, device_seq: 2 },
      },
      `Bearer ${current.deviceToken}`,
    );

    const body = registerResetResponseSchema.parse(response.json());
    expect(body.events.map(({ event_id }) => event_id)).toEqual([third]);
  });

  it("answers the deferred-sale records of the token's own register, never those of another register", async () => {
    const { predecessor, current } = await aRestoredRegister();
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const ownRecord = await insertInboxEvent(db, predecessor.deviceId, {
      eventType: "deferred_sale_recorded",
      schemaVersion: 1,
    });
    await insertInboxEvent(db, other.deviceId, {
      eventType: "deferred_sale_recorded",
      schemaVersion: 1,
    });

    const response = await reset(
      { predecessor_device_id: predecessor.deviceId, last_acknowledged_seq: 0 },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(200);
    const { events } = registerResetResponseSchema.parse(response.json());
    expect(events.map(({ event_id }) => event_id)).toEqual([ownRecord]);
  });

  describe("the credit note answers", () => {
    async function aVoidedSale(
      deviceId: string,
      creditNoteId: string | null = crypto.randomUUID(),
    ) {
      const saleId = crypto.randomUUID();
      await insertInboxEvent(db, deviceId, {
        eventType: "sale_voided",
        schemaVersion: 3,
        aggregateId: saleId,
        payload:
          creditNoteId === null
            ? {}
            : {
                credit_note: {
                  id: creditNoteId,
                  total: 4800,
                  receiver_tax_status_code: 5,
                  corrects: { voucher_type: 11, point_of_sale: 7, number: 1 },
                },
              },
      });
      return { saleId, creditNoteId };
    }

    function resetOf(
      predecessor: { deviceId: string },
      current: { deviceToken: string },
      after?: { device_id: string; device_seq: number },
    ) {
      return reset(
        {
          predecessor_device_id: predecessor.deviceId,
          last_acknowledged_seq: 0,
          ...(after && { after }),
        },
        `Bearer ${current.deviceToken}`,
      );
    }

    it("answers what the tax authority said about the credit notes of the register's voided sales", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const authorized = await aVoidedSale(predecessor.deviceId);
      const rejected = await aVoidedSale(predecessor.deviceId);
      const authorizedId = await insertSaleCreditNote(db, current.registerId, authorized.saleId, {
        ...anAuthorizedAnswer(9),
        id: authorized.creditNoteId ?? "",
      });
      const rejectedId = await insertSaleCreditNote(db, current.registerId, rejected.saleId, {
        ...aRejectedAnswer(),
        id: rejected.creditNoteId ?? "",
      });

      const response = await resetOf(predecessor, current);

      expect(response.statusCode).toBe(200);
      const { credit_notes, unrequested_credit_note_ids } = registerResetResponseSchema.parse(
        response.json(),
      );
      expect(unrequested_credit_note_ids).toEqual([]);
      expect(credit_notes).toHaveLength(2);
      expect(credit_notes).toEqual(
        expect.arrayContaining([
          {
            credit_note_id: authorizedId,
            answered_at: ANSWERED_AT.toISOString(),
            state: "AUTHORIZED",
            point_of_sale: 7,
            number: 9,
            issued_on: "2026-10-07",
            issued_at: REQUESTED_AT.toISOString(),
            authorization_code: "74123456789012",
            authorization_code_due_on: "2026-10-17",
          },
          {
            credit_note_id: rejectedId,
            answered_at: ANSWERED_AT.toISOString(),
            state: "REJECTED",
          },
        ]),
      );
    });

    async function aReturnedSale(deviceId: string) {
      const saleId = crypto.randomUUID();
      const returnId = crypto.randomUUID();
      const creditNoteId = crypto.randomUUID();
      await insertInboxEvent(db, deviceId, {
        eventType: "sale_returned",
        schemaVersion: 2,
        aggregateId: saleId,
        payload: {
          id: returnId,
          sale_id: saleId,
          credit_note: {
            id: creditNoteId,
            total: 1200,
            receiver_tax_status_code: 5,
            corrects: { voucher_type: 11, point_of_sale: 7, number: 1 },
            issued_on: "2026-10-07",
          },
        },
      });
      return { saleId, returnId, creditNoteId };
    }

    it("answers the credit notes of the register's returns, one to be regularized included", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const authorized = await aReturnedSale(predecessor.deviceId);
      const toRegularize = await aReturnedSale(predecessor.deviceId);
      const unrequested = await aReturnedSale(predecessor.deviceId);
      for (const [returned, answer] of [
        [authorized, anAuthorizedAnswer(9)],
        [
          toRegularize,
          { answerKind: "regularization_required", answeredAt: ANSWERED_AT, number: null },
        ],
      ] as const) {
        await insertSaleCreditNote(db, current.registerId, returned.saleId, {
          ...answer,
          id: returned.creditNoteId,
          reason: "sale_return",
          returnId: returned.returnId,
          issueOn: "2026-10-07",
          total: 1200,
        });
      }

      const response = await resetOf(predecessor, current);

      expect(response.statusCode).toBe(200);
      const body = registerResetResponseSchema.parse(response.json());
      expect(body.credit_notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ credit_note_id: authorized.creditNoteId, state: "AUTHORIZED" }),
          {
            credit_note_id: toRegularize.creditNoteId,
            answered_at: ANSWERED_AT.toISOString(),
            state: "REGULARIZATION_REQUIRED",
          },
        ]),
      );
      expect(body.credit_notes).toHaveLength(2);
      expect(body.unrequested_credit_note_ids).toEqual([unrequested.creditNoteId]);
    });

    it("answers already credited, when it was refused, for a credit note the cloud refused", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const refused = await aVoidedSale(predecessor.deviceId);
      const refusedAt = new Date("2026-10-07T10:35:00.000Z");
      await db.insert(saleCreditNoteRefusals).values({
        creditNoteId: refused.creditNoteId ?? "",
        registerId: current.registerId,
        saleId: refused.saleId,
        refusedAt,
      });

      const response = await resetOf(predecessor, current);

      const body = registerResetResponseSchema.parse(response.json());
      expect(body.credit_notes).toEqual([
        {
          credit_note_id: refused.creditNoteId,
          answered_at: refusedAt.toISOString(),
          state: "ALREADY_CREDITED",
        },
      ]);
      expect(body.unrequested_credit_note_ids).toEqual([]);
    });

    it("answers as issued offline, never as unrequested, a credit note the register issued under its contingency code", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const issued = await aVoidedSale(predecessor.deviceId);
      const saleId = issued.saleId;
      await db.insert(offlineFiscalDocuments).values({
        id: crypto.randomUUID(),
        saleId,
        registerId: current.registerId,
        pointOfSale: 31,
        documentType: "credit_note_c",
        number: 4,
        issuedOn: "2026-10-07",
        generatedAt: new Date("2026-10-07T10:29:00.000Z"),
        generationStamp: "20261007072900",
        offlineAuthorizationCode: "71234567890123",
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        buyerDocumentType: 99,
        buyerDocumentNumber: 0,
        buyerTaxStatusCode: 5,
        total: 4800,
        netAmount: 4800,
        cause: "no_connectivity",
        recordedAt: new Date("2026-10-07T11:00:00.000Z"),
        creditNoteId: issued.creditNoteId ?? "",
        correctedVoucherType: 11,
        correctedPointOfSale: 31,
        correctedNumber: 3,
      });

      const response = await resetOf(predecessor, current);

      const body = registerResetResponseSchema.parse(response.json());
      expect(body.credit_notes).toEqual([
        {
          credit_note_id: issued.creditNoteId,
          answered_at: "2026-10-07T10:29:00.000Z",
          state: "ISSUED_OFFLINE",
          point_of_sale: 31,
          number: 4,
          issued_on: "2026-10-07",
          issued_at: "2026-10-07T10:29:00.000Z",
          offline_authorization_code: "71234567890123",
          fortnight_start: "2026-10-01",
          fortnight_end: "2026-10-15",
        },
      ]);
      expect(body.unrequested_credit_note_ids).toEqual([]);
    });

    it("names as unrequested the credit note of a voided sale the cloud never recorded", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const unrequested = await aVoidedSale(predecessor.deviceId);

      const response = await resetOf(predecessor, current);

      const body = registerResetResponseSchema.parse(response.json());
      expect(body.unrequested_credit_note_ids).toEqual([unrequested.creditNoteId]);
      expect(body.credit_notes).toEqual([]);
    });

    it("neither answers nor names as unrequested a credit note still unsettled in the cloud", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const waiting = await aVoidedSale(predecessor.deviceId);
      await insertSaleCreditNote(db, current.registerId, waiting.saleId, {
        id: waiting.creditNoteId ?? "",
      });

      const response = await resetOf(predecessor, current);

      const body = registerResetResponseSchema.parse(response.json());
      expect(body.credit_notes).toEqual([]);
      expect(body.unrequested_credit_note_ids).toEqual([]);
    });

    it("names no credit note for a voided sale that asked for none", async () => {
      const { predecessor, current } = await aRestoredRegister();
      await aVoidedSale(predecessor.deviceId, null);

      const response = await resetOf(predecessor, current);

      const body = registerResetResponseSchema.parse(response.json());
      expect(body.credit_notes).toEqual([]);
      expect(body.unrequested_credit_note_ids).toEqual([]);
    });

    it("never answers the credit note another register holds under an id this register's void names", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
      const voided = await aVoidedSale(predecessor.deviceId);
      await insertSaleCreditNote(db, other.registerId, voided.saleId, {
        ...anAuthorizedAnswer(),
        id: voided.creditNoteId ?? "",
      });

      const response = await resetOf(predecessor, current);

      expect(registerResetResponseSchema.parse(response.json()).credit_notes).toEqual([]);
    });

    it("leaves out the credit note of a sale the page's events do not void", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const completedSale = crypto.randomUUID();
      await insertInboxEvent(db, predecessor.deviceId, { aggregateId: completedSale });
      await insertSaleCreditNote(db, current.registerId, completedSale, anAuthorizedAnswer());

      const response = await resetOf(predecessor, current);

      expect(registerResetResponseSchema.parse(response.json()).credit_notes).toEqual([]);
    });

    it("answers each credit note with the page that holds its voided sale, exactly once across the pages", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const firstSale = await aVoidedSale(predecessor.deviceId);
      for (let filler = 0; filler < 199; filler += 1) {
        await insertInboxEvent(db, predecessor.deviceId);
      }
      const lastOfFirstPage = await db
        .select({ deviceSeq: inbox.deviceSeq })
        .from(inbox)
        .orderBy(desc(inbox.deviceSeq))
        .limit(1);
      const secondSale = await aVoidedSale(predecessor.deviceId);
      const firstCreditNote = await insertSaleCreditNote(db, current.registerId, firstSale.saleId, {
        ...anAuthorizedAnswer(),
        id: firstSale.creditNoteId ?? "",
      });
      const secondCreditNote = await insertSaleCreditNote(
        db,
        current.registerId,
        secondSale.saleId,
        { ...anAuthorizedAnswer(), id: secondSale.creditNoteId ?? "" },
      );

      const first = registerResetResponseSchema.parse((await resetOf(predecessor, current)).json());
      const second = registerResetResponseSchema.parse(
        (
          await resetOf(predecessor, current, {
            device_id: predecessor.deviceId,
            device_seq: lastOfFirstPage[0]?.deviceSeq ?? 0,
          })
        ).json(),
      );

      expect(first.next).not.toBeNull();
      expect(first.credit_notes.map(({ credit_note_id }) => credit_note_id)).toEqual([
        firstCreditNote,
      ]);
      expect(second.credit_notes.map(({ credit_note_id }) => credit_note_id)).toEqual([
        secondCreditNote,
      ]);
    });
  });

  describe("the unclear deferral answers", () => {
    const REQUEST_ANSWERED_AT = new Date("2026-10-08T15:00:00.000Z");

    async function anUnclearDeferral(
      deviceId: string,
      fiscalDocumentId = crypto.randomUUID(),
      eventOverrides: Partial<InboxEventValues> = {},
    ) {
      await insertInboxEvent(db, deviceId, {
        eventType: "deferred_sale_recorded",
        schemaVersion: 2,
        payload: {
          reason: "unclear_outcome",
          unclear_document: { fiscal_document_id: fiscalDocumentId },
        },
        ...eventOverrides,
      });
      return fiscalDocumentId;
    }

    async function aFiscalRequest(
      registerId: string,
      fiscalDocumentId: string,
      answer: "authorized" | "rejected" | "unclear",
    ) {
      const { saleEvent: _saleEvent, ...request } = authorizationRequestRecord(registerId, {
        fiscalDocumentId,
        number: nextRequestNumber++,
      });
      await db.insert(fiscalRequests).values({
        ...request,
        answerKind: answer,
        answeredAt: REQUEST_ANSWERED_AT,
        ...(answer === "authorized" && {
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-18",
        }),
        ...(answer === "rejected" && { rejectionCodes: [10015], rejectionClass: "content" }),
        ...(answer === "unclear" && { unclearCodes: [] }),
      });
    }

    function resetOf(predecessor: { deviceId: string }, current: { deviceToken: string }) {
      return reset(
        { predecessor_device_id: predecessor.deviceId, last_acknowledged_seq: 0 },
        `Bearer ${current.deviceToken}`,
      );
    }

    it("answers what the cloud settled about each document an unclear outcome left waiting on the page", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const authorized = await anUnclearDeferral(predecessor.deviceId);
      const rejected = await anUnclearDeferral(predecessor.deviceId);
      const stillUnclear = await anUnclearDeferral(predecessor.deviceId);
      const neverAsked = await anUnclearDeferral(predecessor.deviceId);
      await aFiscalRequest(current.registerId, authorized, "authorized");
      await aFiscalRequest(current.registerId, rejected, "rejected");
      await aFiscalRequest(current.registerId, stillUnclear, "unclear");

      const response = await resetOf(predecessor, current);

      expect(response.statusCode).toBe(200);
      const { unclear_deferrals } = registerResetResponseSchema.parse(response.json());
      expect(unclear_deferrals).toHaveLength(4);
      expect(unclear_deferrals).toEqual(
        expect.arrayContaining([
          {
            fiscal_document_id: authorized,
            state: "AUTHORIZED",
            authorization_code: "75123456789012",
            authorization_code_due_on: "2026-10-18",
            answered_at: REQUEST_ANSWERED_AT.toISOString(),
          },
          { fiscal_document_id: rejected, state: "REJECTED" },
          { fiscal_document_id: stillUnclear, state: "UNSETTLED" },
          { fiscal_document_id: neverAsked, state: "UNSETTLED" },
        ]),
      );
    });

    it("never answers the request another register holds under a document id this register's deferral names", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
      const documentId = await anUnclearDeferral(predecessor.deviceId);
      await aFiscalRequest(other.registerId, documentId, "authorized");

      const response = await resetOf(predecessor, current);

      expect(registerResetResponseSchema.parse(response.json()).unclear_deferrals).toEqual([
        { fiscal_document_id: documentId, state: "UNSETTLED" },
      ]);
    });

    it("answers nothing for a deferral of the first version, which names no document", async () => {
      const { predecessor, current } = await aRestoredRegister();
      await anUnclearDeferral(predecessor.deviceId, undefined, {
        schemaVersion: 1,
        payload: { reason: "unclear_outcome" },
      });

      const response = await resetOf(predecessor, current);

      expect(registerResetResponseSchema.parse(response.json()).unclear_deferrals).toEqual([]);
    });

    it("answers nothing for a request of the register whose deferral the page does not hold", async () => {
      const { predecessor, current } = await aRestoredRegister();
      await aFiscalRequest(current.registerId, crypto.randomUUID(), "authorized");

      const response = await resetOf(predecessor, current);

      expect(registerResetResponseSchema.parse(response.json()).unclear_deferrals).toEqual([]);
    });
  });
});
