import {
  cloudErrorSchema,
  type SaleVoidCreditNoteRequestBody,
  saleVoidCreditNoteResponseSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import {
  alerts,
  creditNotes,
  fiscalTasks,
  inbox,
  installationRequestAttempts,
  pointOfSaleClaims,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import {
  PUSHING_CHAIN_KEY,
  pushingDevice,
  saleVoided,
} from "../sync/test-support/pushing-device.js";
import {
  insertRegisterWithPointOfSale,
  saleCompletedEvent,
  saleReturnedEvent,
  saleVoidedEvent,
} from "./test-support/authorization-request-fixtures.js";
import { creditNoteRouteUnderTest, NOW } from "./test-support/credit-note-route-under-test.js";
import { answersInTurn } from "./test-support/fake-wsfe-server.js";
import { insertRealTimeInvoice } from "./test-support/held-invoice-fixtures.js";
import { anAuthorizedAnswer, insertSaleCreditNote } from "./test-support/sale-credit-notes.js";

const route = creditNoteRouteUnderTest();

function requestBody(
  overrides: Partial<SaleVoidCreditNoteRequestBody> = {},
  number = 42,
): SaleVoidCreditNoteRequestBody {
  const creditNoteId = overrides.credit_note_id ?? crypto.randomUUID();
  return {
    credit_note_id: creditNoteId,
    point_of_sale: 7,
    sale_event: saleVoidedEvent(crypto.randomUUID(), {
      id: creditNoteId,
      total: 12_550,
      corrects: { voucherType: 11, pointOfSale: 31, number },
    }),
    ...overrides,
  };
}

async function enrollRegister(pointOfSaleNumber = 7, outboxChainKey?: string) {
  const registerId = await insertRegisterWithPointOfSale(route.db, {
    pointOfSaleNumber,
    name: `caja-${pointOfSaleNumber}`,
  });
  const [actor] = await route.db.select({ id: users.id }).from(users).limit(1);
  await route.db.insert(pointOfSaleClaims).values({
    pointOfSaleNumber: pointOfSaleNumber + 24,
    registerId,
    mechanism: "offline",
    claimedBy: actor?.id ?? "",
  });
  return insertEnrolledInstallation(route.db, {
    now: NOW,
    existingRegisterId: registerId,
    ...(outboxChainKey !== undefined && { outboxChainKey }),
  });
}

function requestCreditNote(payload: unknown, authorization?: string) {
  return route.app.inject({
    method: "POST",
    url: "/fiscal/credit-notes",
    payload: payload as object,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

function rows() {
  return route.db.select().from(creditNotes);
}

function sentValue(request: string | undefined, element: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${element}>([^<]*)</(?:\\w+:)?${element}>`).exec(
    request ?? "",
  )?.[1];
}

const AUTHORIZED_IN_TURN = answersInTurn(
  "fe-comp-ultimo-autorizado-credit-note.xml",
  "fe-cae-solicitar-credit-note-authorized.xml",
);

describe("POST /fiscal/credit-notes", () => {
  describe("who may ask", () => {
    it("refuses a request that carries no device token, recording nothing", async () => {
      const response = await requestCreditNote(requestBody());

      expect(response.statusCode).toBe(401);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
      expect(await rows()).toEqual([]);
    });

    it("refuses a revoked installation", async () => {
      await enrollRegister();
      const revoked = await insertEnrolledInstallation(route.db, {
        now: NOW,
        revokedAt: new Date(NOW.getTime() - 1_000),
      });

      const response = await requestCreditNote(requestBody(), `Bearer ${revoked.deviceToken}`);

      expect(response.statusCode).toBe(403);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("revoked");
      expect(await rows()).toEqual([]);
    });

    it("counts each request against the installation's fiscal requests", async () => {
      const { deviceId, deviceToken } = await enrollRegister();

      await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);

      expect(
        await route.db
          .select({ endpoint: installationRequestAttempts.endpoint })
          .from(installationRequestAttempts)
          .where(eq(installationRequestAttempts.deviceId, deviceId)),
      ).toEqual([{ endpoint: "fiscal_authorize" }]);
    });

    it("refuses a request past the installation's limit with when to retry, recording nothing", async () => {
      const { deviceId, deviceToken } = await enrollRegister();
      await insertRequestsUpToLimit(
        route.db,
        deviceId,
        "fiscal_authorize",
        new Date(NOW.getTime() - 59 * 60 * 1000),
      );

      const response = await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("60");
      expect(await rows()).toEqual([]);
    });

    it("refuses a point of sale that belongs to another register", async () => {
      await enrollRegister(7);
      const other = await enrollRegister(8);

      const response = await requestCreditNote(
        requestBody({ point_of_sale: 7 }),
        `Bearer ${other.deviceToken}`,
      );

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
      expect(await rows()).toEqual([]);
    });

    it("refuses a credit note of an invoice from a point of sale the register never held", async () => {
      const { deviceToken } = await enrollRegister();
      const body = requestBody();

      const response = await requestCreditNote(
        {
          ...body,
          sale_event: saleVoidedEvent(crypto.randomUUID(), {
            id: body.credit_note_id,
            total: 12_550,
            corrects: { voucherType: 11, pointOfSale: 99, number: 42 },
          }),
        },
        `Bearer ${deviceToken}`,
      );

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
      expect(await rows()).toEqual([]);
    });

    it("refuses a credit note id another register recorded, leaving it as it was", async () => {
      const owner = await enrollRegister(7);
      const other = await enrollRegister(8);
      const body = requestBody();
      await requestCreditNote(body, `Bearer ${owner.deviceToken}`);

      const response = await requestCreditNote(
        { ...body, point_of_sale: 8 },
        `Bearer ${other.deviceToken}`,
      );

      expect(response.statusCode).toBe(404);
      expect(await rows()).toMatchObject([{ registerId: owner.registerId }]);
    });
  });

  describe("what it reads", () => {
    it("refuses a body that is not a credit note request", async () => {
      const { deviceToken } = await enrollRegister();

      const response = await requestCreditNote({ credit_note_id: 1 }, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
    });

    it("refuses an event that is not the voiding that asks for the credit note", async () => {
      const { deviceToken } = await enrollRegister();

      const response = await requestCreditNote(
        { ...requestBody(), sale_event: saleCompletedEvent(crypto.randomUUID()) },
        `Bearer ${deviceToken}`,
      );

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(await rows()).toEqual([]);
    });

    it("refuses a void whose credit note corrects no invoice C the voided sale could carry", async () => {
      const { deviceToken } = await enrollRegister();
      const creditNoteId = crypto.randomUUID();

      const response = await requestCreditNote(
        requestBody({
          credit_note_id: creditNoteId,
          sale_event: saleVoidedEvent(crypto.randomUUID(), {
            id: creditNoteId,
            total: 12_550,
            corrects: { voucherType: 6, pointOfSale: 31, number: 0 },
          }),
        }),
        `Bearer ${deviceToken}`,
      );

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(await rows()).toEqual([]);
    });
  });

  describe("what it answers", () => {
    it("records the credit note, issues it at the tax authority for the invoice's own point of sale and answers AUTHORIZED", async () => {
      const { deviceToken, registerId } = await enrollRegister();
      await route.issueWsaaToken();
      route.wsfe.behave(AUTHORIZED_IN_TURN);
      const body = requestBody();

      const response = await requestCreditNote(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(saleVoidCreditNoteResponseSchema.parse(response.json())).toEqual({
        state: "AUTHORIZED",
        point_of_sale: 7,
        number: 5,
        issued_on: "2026-10-07",
        issued_at: NOW.toISOString(),
        authorization_code: "74123456789055",
        authorization_code_due_on: "2026-10-18",
      });
      const [solicitation] = route.wsfe.requests.slice(-1);
      expect(sentValue(solicitation, "CbteTipo")).toBe("13");
      expect(sentValue(solicitation, "PtoVta")).toBe("7");
      expect(solicitation).toMatch(/<(?:\w+:)?CbtesAsoc>/);
      expect(await rows()).toMatchObject([
        {
          id: body.credit_note_id,
          registerId,
          reason: "sale_void",
          pointOfSale: 7,
          associatedPointOfSale: 31,
          associatedNumber: 42,
          total: 12_550,
          answerKind: "authorized",
        },
      ]);
      expect(route.enqueuedCreditNotes).toEqual([body.credit_note_id]);
    });

    it("answers the same credit note when the same request is repeated, without asking the tax authority again", async () => {
      const { deviceToken } = await enrollRegister();
      await route.issueWsaaToken();
      route.wsfe.behave(AUTHORIZED_IN_TURN);
      const body = requestBody();
      const first = await requestCreditNote(body, `Bearer ${deviceToken}`);
      const asked = route.wsfe.requests.length;

      const second = await requestCreditNote(body, `Bearer ${deviceToken}`);

      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual(first.json());
      expect(route.wsfe.requests).toHaveLength(asked);
      expect(await rows()).toHaveLength(1);
    });

    it("answers REJECTED and opens a task for a person when the tax authority rejects the credit note", async () => {
      const { deviceToken } = await enrollRegister();
      await route.issueWsaaToken();
      route.wsfe.behave(
        answersInTurn(
          "fe-comp-ultimo-autorizado-credit-note.xml",
          "fe-cae-solicitar-credit-note-rejected.xml",
        ),
      );

      const response = await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);

      expect(saleVoidCreditNoteResponseSchema.parse(response.json())).toEqual({
        state: "REJECTED",
      });
      expect(await rows()).toMatchObject([{ answerKind: "rejected" }]);
      expect(await route.db.select().from(fiscalTasks)).toMatchObject([
        { kind: "credit_note_rejected", state: "open" },
      ]);
    });

    it("answers IN_PROGRESS when the tax authority gives no answer, keeping the credit note requested", async () => {
      const { deviceToken } = await enrollRegister();
      await route.issueWsaaToken();
      route.wsfe.behave(
        answersInTurn("fe-comp-ultimo-autorizado-credit-note.xml", "fe-cae-solicitar-empty.xml"),
      );

      const response = await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);

      expect(saleVoidCreditNoteResponseSchema.parse(response.json())).toEqual({
        state: "IN_PROGRESS",
      });
      expect(await rows()).toMatchObject([{ answerKind: "unclear", number: 5 }]);
    });

    it("answers IN_PROGRESS and keeps the credit note recorded when the tax authority cannot be asked yet", async () => {
      const { deviceToken } = await enrollRegister();
      const body = requestBody();

      const response = await requestCreditNote(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(saleVoidCreditNoteResponseSchema.parse(response.json())).toEqual({
        state: "IN_PROGRESS",
      });
      expect(await rows()).toMatchObject([{ id: body.credit_note_id, answerKind: null }]);
      expect(route.enqueuedCreditNotes).toEqual([body.credit_note_id]);
    });

    it("refuses a credit note that takes the credits of an invoice over its total, issuing nothing", async () => {
      const { deviceToken, registerId } = await enrollRegister();
      await insertRealTimeInvoice(route.db, {
        registerId,
        pointOfSale: 31,
        number: 42,
        total: 12_550,
      });
      await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);
      route.wsfe.requests.length = 0;

      const response = await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(409);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("conflict");
      expect(route.wsfe.requests).toEqual([]);
      expect(await rows()).toHaveLength(1);
    });

    it("opens, once, an alert about the invoice that already had a credit note, naming the voided sale", async () => {
      const { deviceToken, registerId } = await enrollRegister();
      await insertRealTimeInvoice(route.db, {
        registerId,
        pointOfSale: 31,
        number: 42,
        total: 12_550,
      });
      const first = requestBody();
      await requestCreditNote(first, `Bearer ${deviceToken}`);
      expect(await route.db.select().from(alerts)).toEqual([]);

      await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);
      await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);

      expect(
        await route.db
          .select({ kind: alerts.kind, scope: alerts.scope, detail: alerts.detail })
          .from(alerts),
      ).toEqual([
        {
          kind: "invoice_already_credited",
          scope: "31:factura_c:42",
          detail: {
            pointOfSale: 31,
            number: 42,
            saleId: expect.any(String),
          },
        },
      ]);
    });

    it("opens no alert when the credit note was already recorded and is asked about again", async () => {
      const { deviceToken } = await enrollRegister();
      const body = requestBody();
      await requestCreditNote(body, `Bearer ${deviceToken}`);

      await requestCreditNote(body, `Bearer ${deviceToken}`);

      expect(await route.db.select().from(alerts)).toEqual([]);
    });
  });

  describe("the credit note of a returned sale", () => {
    function returnRequestBody(issuedOn = "2026-10-08") {
      const creditNoteId = crypto.randomUUID();
      const returnId = crypto.randomUUID();
      return {
        returnId,
        body: requestBody({
          credit_note_id: creditNoteId,
          sale_event: saleReturnedEvent(crypto.randomUUID(), returnId, {
            id: creditNoteId,
            total: 3_000,
            issuedOn,
            corrects: { voucherType: 11, pointOfSale: 31, number: 42 },
          }),
        }),
      };
    }

    it("records the credit note with its return and its day, issues it and answers AUTHORIZED", async () => {
      const { deviceToken } = await enrollRegister();
      await route.issueWsaaToken();
      route.wsfe.behave(AUTHORIZED_IN_TURN);
      const { body, returnId } = returnRequestBody("2026-10-08");

      const response = await requestCreditNote(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(saleVoidCreditNoteResponseSchema.parse(response.json()).state).toBe("AUTHORIZED");
      expect(await rows()).toMatchObject([
        {
          id: body.credit_note_id,
          reason: "sale_return",
          returnId,
          issueOn: "2026-10-08",
          total: 3_000,
          associatedNumber: 42,
          answerKind: "authorized",
        },
      ]);
    });

    it("answers REGULARIZATION_REQUIRED and opens a task for a person when a later credit note was already authorized", async () => {
      const { deviceToken, registerId } = await enrollRegister();
      await route.issueWsaaToken();
      await insertSaleCreditNote(route.db, registerId, crypto.randomUUID(), {
        associatedNumber: 7,
        ...anAuthorizedAnswer(),
        issuedOn: "2026-10-08",
      });
      const { body } = returnRequestBody("2026-10-05");

      const response = await requestCreditNote(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(saleVoidCreditNoteResponseSchema.parse(response.json())).toEqual({
        state: "REGULARIZATION_REQUIRED",
      });
      expect(await route.db.select().from(fiscalTasks)).toMatchObject([
        { kind: "credit_note_rejected", creditNoteId: body.credit_note_id, number: null },
      ]);
    });

    it("answers the same REGULARIZATION_REQUIRED when the request is repeated", async () => {
      const { deviceToken, registerId } = await enrollRegister();
      await route.issueWsaaToken();
      await insertSaleCreditNote(route.db, registerId, crypto.randomUUID(), {
        associatedNumber: 7,
        ...anAuthorizedAnswer(),
        issuedOn: "2026-10-08",
      });
      const { body } = returnRequestBody("2026-10-05");
      await requestCreditNote(body, `Bearer ${deviceToken}`);

      const again = await requestCreditNote(body, `Bearer ${deviceToken}`);

      expect(saleVoidCreditNoteResponseSchema.parse(again.json())).toEqual({
        state: "REGULARIZATION_REQUIRED",
      });
      expect(await route.db.select().from(fiscalTasks)).toHaveLength(1);
    });

    function waitingForItsInvoice() {
      const creditNoteId = crypto.randomUUID();
      const saleEvent = saleReturnedEvent(crypto.randomUUID(), crypto.randomUUID(), {
        id: creditNoteId,
        total: 3_000,
        issuedOn: "2026-10-08",
        corrects: { voucherType: 11, pointOfSale: 31, number: 1 },
      });
      return {
        creditNoteId,
        request: {
          credit_note_id: creditNoteId,
          point_of_sale: 7,
          sale_event: {
            ...saleEvent,
            payload: {
              ...(saleEvent.payload as Record<string, unknown>),
              credit_note: {
                id: creditNoteId,
                total: 3_000,
                receiver_tax_status_code: null,
                corrects: null,
                issued_on: "2026-10-08",
              },
            },
          },
        },
      };
    }

    it("refuses a credit note that waits for its invoice when the request does not name it", async () => {
      const { deviceToken } = await enrollRegister();
      const { request } = waitingForItsInvoice();

      const response = await requestCreditNote(request, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(await rows()).toEqual([]);
    });

    it("corrects the invoice a credit note that waited for it now names", async () => {
      const { deviceToken } = await enrollRegister();
      await route.issueWsaaToken();
      route.wsfe.behave(AUTHORIZED_IN_TURN);
      const { creditNoteId, request } = waitingForItsInvoice();

      const response = await requestCreditNote(
        {
          ...request,
          invoice: {
            corrects: { voucher_type: 11, point_of_sale: 31, number: 66 },
            receiver_tax_status_code: 5,
          },
        },
        `Bearer ${deviceToken}`,
      );

      expect(response.statusCode).toBe(200);
      expect(await rows()).toMatchObject([
        { id: creditNoteId, associatedNumber: 66, receiverTaxStatusCode: 5, reason: "sale_return" },
      ]);
    });
  });

  describe("the sale event a request carries", () => {
    async function registerPushingVoids() {
      const installation = await enrollRegister(7, PUSHING_CHAIN_KEY);
      await route.issueWsaaToken();
      route.wsfe.behave(AUTHORIZED_IN_TURN);
      const creditNoteId = crypto.randomUUID();
      const [saleEvent] = pushingDevice(route.app, installation.deviceToken).chain([
        saleVoided({
          saleId: crypto.randomUUID(),
          creditNoteId,
          total: 12_550,
          corrects: { voucherType: 11, pointOfSale: 31, number: 42 },
          voidedAt: "2026-10-08T01:29:58.000Z",
        }),
      ]);
      if (saleEvent === undefined) {
        throw new Error("test setup: no event was chained");
      }
      return {
        installation,
        body: requestBody({ credit_note_id: creditNoteId, sale_event: saleEvent }),
        saleEvent,
      };
    }

    it("is held in the inbox of the requesting installation once the credit note is authorized", async () => {
      const { installation, body, saleEvent } = await registerPushingVoids();

      const response = await requestCreditNote(body, `Bearer ${installation.deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(saleVoidCreditNoteResponseSchema.parse(response.json()).state).toBe("AUTHORIZED");
      const held = await route.db.select().from(inbox);
      expect(held).toHaveLength(1);
      expect(held[0]).toMatchObject({
        deviceId: installation.deviceId,
        deviceSeq: 1,
        eventId: saleEvent.event_id,
        appliedAt: null,
      });
      expect(route.report).not.toHaveBeenCalled();
    });

    it("is held in the inbox before the tax authority is called", async () => {
      const { installation, body } = await registerPushingVoids();
      const solicit = route.creditNotes.solicit.bind(route.creditNotes);
      const heldWhenCalled: number[] = [];
      vi.spyOn(route.creditNotes, "solicit").mockImplementation(async (solicitation) => {
        heldWhenCalled.push((await route.db.select().from(inbox)).length);
        return solicit(solicitation);
      });

      await requestCreditNote(body, `Bearer ${installation.deviceToken}`);

      expect(heldWhenCalled).toEqual([1]);
    });

    it("leaves one row when the same request is sent again", async () => {
      const { installation, body } = await registerPushingVoids();

      await requestCreditNote(body, `Bearer ${installation.deviceToken}`);
      const again = await requestCreditNote(body, `Bearer ${installation.deviceToken}`);

      expect(again.statusCode).toBe(200);
      expect(await route.db.select().from(inbox)).toHaveLength(1);
    });
  });
});
