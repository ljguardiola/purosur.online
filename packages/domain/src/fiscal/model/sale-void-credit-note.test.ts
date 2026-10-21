import { describe, expect, it } from "vitest";
import {
  type CreditNoteStanding,
  confirmedCreditNoteAnswer,
  creditNoteAnswerOf,
  invoiceToCorrect,
  type SaleInvoice,
  type SaleVoidCreditNote,
  saleVoidCreditNotePayload,
} from "./sale-void-credit-note.js";

const REAL_TIME: SaleInvoice = {
  origin: "real_time",
  state: "AUTHORIZED",
  pointOfSale: 3,
  number: 1204,
  buyerTaxStatusCode: 5,
};

const OFFLINE: SaleInvoice = {
  origin: "offline",
  state: "AUTHORIZED",
  pointOfSale: 8,
  number: 77,
  buyerTaxStatusCode: 5,
};

describe("invoiceToCorrect", () => {
  it("finds no invoice in a sale without documents", () => {
    expect(invoiceToCorrect([])).toBeNull();
  });

  it("is the factura C voucher of the real-time invoice the tax authority authorized", () => {
    expect(invoiceToCorrect([REAL_TIME])).toEqual({
      voucher: { voucherType: 11, pointOfSale: 3, number: 1204 },
      buyerTaxStatusCode: 5,
    });
  });

  it("is the factura C voucher of the contingency document", () => {
    expect(invoiceToCorrect([OFFLINE])).toEqual({
      voucher: { voucherType: 11, pointOfSale: 8, number: 77 },
      buyerTaxStatusCode: 5,
    });
  });

  it.each([["REQUESTING"], ["UNKNOWN"], ["REJECTED"], ["RELEASED"], ["CONFLICTING"]] as const)(
    "ignores a real-time document that is %s",
    (state) => {
      expect(invoiceToCorrect([{ ...REAL_TIME, state }])).toBeNull();
    },
  );

  it.each([
    ["the real-time one first", [REAL_TIME, OFFLINE]],
    ["the contingency one first", [OFFLINE, REAL_TIME]],
  ])(
    "is the contingency document the customer received when both are authorized, with %s",
    (_case, invoices) => {
      expect(invoiceToCorrect(invoices)?.voucher).toEqual({
        voucherType: 11,
        pointOfSale: 8,
        number: 77,
      });
    },
  );

  it("is the authorized real-time invoice when the other real-time documents are not", () => {
    expect(
      invoiceToCorrect([
        { ...REAL_TIME, state: "REJECTED", number: 1203 },
        REAL_TIME,
        { ...REAL_TIME, state: "UNKNOWN", number: 1205 },
      ])?.voucher.number,
    ).toBe(1204);
  });
});

const CREDIT_NOTE: SaleVoidCreditNote = {
  creditNoteId: "credit-note-1",
  saleId: "sale-1",
  total: 7_500,
  receiverTaxStatusCode: 5,
  correctedVoucher: { voucherType: 11, pointOfSale: 8, number: 77 },
};

const PAYLOAD = {
  id: "credit-note-1",
  total: 7_500,
  receiver_tax_status_code: 5,
  corrects: { voucher_type: 11, point_of_sale: 8, number: 77 },
};

describe("saleVoidCreditNotePayload", () => {
  it("describes the credit note the void asks for", () => {
    expect(saleVoidCreditNotePayload(CREDIT_NOTE)).toEqual(PAYLOAD);
  });
});

const AUTHORIZED_STANDING: CreditNoteStanding = {
  kind: "authorized",
  number: 9,
  issuedOn: "2026-10-07",
  requestedAt: new Date("2026-10-07T10:29:00.000Z"),
  authorizationCode: "74123456789012",
  authorizationCodeDueOn: "2026-10-17",
};

const UNCONFIRMED_STANDINGS: [string, CreditNoteStanding][] = [
  ["not requested yet", { kind: "not_requested" }],
  [
    "requested and unanswered",
    {
      kind: "requested",
      number: 9,
      issuedOn: "2026-10-07",
      requestedAt: new Date("2026-10-07T10:29:00.000Z"),
      unclearAnsweredAt: null,
    },
  ],
  [
    "requested and answered unclearly",
    {
      kind: "requested",
      number: 9,
      issuedOn: "2026-10-07",
      requestedAt: new Date("2026-10-07T10:29:00.000Z"),
      unclearAnsweredAt: new Date("2026-10-07T10:31:00.000Z"),
    },
  ],
];

describe("creditNoteAnswerOf", () => {
  it("is the authorization with the point of sale, issued when it was requested", () => {
    expect(creditNoteAnswerOf(AUTHORIZED_STANDING, 12)).toEqual({
      kind: "authorized",
      pointOfSale: 12,
      number: 9,
      issuedOn: "2026-10-07",
      issuedAt: new Date("2026-10-07T10:29:00.000Z"),
      authorizationCode: "74123456789012",
      authorizationCodeDueOn: "2026-10-17",
    });
  });

  it("is the rejection", () => {
    expect(creditNoteAnswerOf({ kind: "rejected" }, 12)).toEqual({ kind: "rejected" });
  });

  it.each(UNCONFIRMED_STANDINGS)("is in progress when the credit note is %s", (_case, standing) => {
    expect(creditNoteAnswerOf(standing, 12)).toEqual({ kind: "in_progress" });
  });
});

describe("confirmedCreditNoteAnswer", () => {
  it("is the authorization the tax authority gave", () => {
    expect(confirmedCreditNoteAnswer(AUTHORIZED_STANDING, 12)).toEqual({
      kind: "authorized",
      pointOfSale: 12,
      number: 9,
      issuedOn: "2026-10-07",
      issuedAt: new Date("2026-10-07T10:29:00.000Z"),
      authorizationCode: "74123456789012",
      authorizationCodeDueOn: "2026-10-17",
    });
  });

  it("is the rejection the tax authority gave", () => {
    expect(confirmedCreditNoteAnswer({ kind: "rejected" }, 12)).toEqual({ kind: "rejected" });
  });

  it.each(UNCONFIRMED_STANDINGS)("is no answer when the credit note is %s", (_case, standing) => {
    expect(confirmedCreditNoteAnswer(standing, 12)).toBeNull();
  });
});
