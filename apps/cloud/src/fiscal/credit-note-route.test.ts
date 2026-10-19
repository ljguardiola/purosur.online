import {
  cloudErrorSchema,
  type SaleVoidCreditNoteRequestBody,
  saleVoidCreditNoteResponseSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  alerts,
  creditNotes,
  fiscalTasks,
  installationRequestAttempts,
  pointOfSaleClaims,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import {
  insertRegisterWithPointOfSale,
  saleCompletedEvent,
  saleVoidedEvent,
} from "./test-support/authorization-request-fixtures.js";
import { creditNoteRouteUnderTest, NOW } from "./test-support/credit-note-route-under-test.js";
import { answersInTurn } from "./test-support/fake-wsfe-server.js";

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

async function enrollRegister(pointOfSaleNumber = 7) {
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
  return insertEnrolledInstallation(route.db, { now: NOW, existingRegisterId: registerId });
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

    it("refuses a second credit note for an invoice that already has one, issuing nothing", async () => {
      const { deviceToken } = await enrollRegister();
      await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);
      route.wsfe.requests.length = 0;

      const response = await requestCreditNote(requestBody(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(409);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("conflict");
      expect(route.wsfe.requests).toEqual([]);
      expect(await rows()).toHaveLength(1);
    });

    it("opens, once, an alert about the invoice that already had a credit note, naming the voided sale", async () => {
      const { deviceToken } = await enrollRegister();
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
});
