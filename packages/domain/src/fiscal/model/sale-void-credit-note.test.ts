import { describe, expect, it } from "vitest";
import {
  invoiceToCorrect,
  type SaleInvoice,
  type SaleVoidCreditNote,
  saleVoidCreditNoteOfEvent,
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

describe("saleVoidCreditNoteOfEvent", () => {
  const event = (overrides: Record<string, unknown> = {}) => ({
    event_type: "sale_voided",
    aggregate_id: "sale-1",
    payload: { credit_note: PAYLOAD },
    ...overrides,
  });

  it("reads the credit note the voided sale's event asks for", () => {
    expect(saleVoidCreditNoteOfEvent(event())).toEqual(CREDIT_NOTE);
  });

  it("reads the payload the void writes", () => {
    expect(
      saleVoidCreditNoteOfEvent(
        event({ payload: { credit_note: saleVoidCreditNotePayload(CREDIT_NOTE) } }),
      ),
    ).toEqual(CREDIT_NOTE);
  });

  it.each([
    ["an event of another type", { event_type: "sale_completed" }],
    ["a void that asks for no credit note", { payload: { credit_note: null } }],
    ["a void without the member", { payload: {} }],
    ["a credit note that is not an object", { payload: { credit_note: "credit-note-1" } }],
    ["a credit note without an id", { payload: { credit_note: { ...PAYLOAD, id: undefined } } }],
    ["a credit note with a blank id", { payload: { credit_note: { ...PAYLOAD, id: "" } } }],
    ["a total that is not a number", { payload: { credit_note: { ...PAYLOAD, total: "7500" } } }],
    ["a fractional total", { payload: { credit_note: { ...PAYLOAD, total: 75.5 } } }],
    ["a zero total", { payload: { credit_note: { ...PAYLOAD, total: 0 } } }],
    [
      "a receiver status that is not an integer",
      { payload: { credit_note: { ...PAYLOAD, receiver_tax_status_code: 5.5 } } },
    ],
    ["no corrected voucher", { payload: { credit_note: { ...PAYLOAD, corrects: null } } }],
    [
      "a corrected voucher without its number",
      {
        payload: {
          credit_note: { ...PAYLOAD, corrects: { voucher_type: 11, point_of_sale: 8 } },
        },
      },
    ],
    [
      "a corrected voucher with a text point of sale",
      {
        payload: {
          credit_note: {
            ...PAYLOAD,
            corrects: { voucher_type: 11, point_of_sale: "8", number: 77 },
          },
        },
      },
    ],
    [
      "a corrected voucher with a fractional voucher type",
      {
        payload: {
          credit_note: {
            ...PAYLOAD,
            corrects: { voucher_type: 11.5, point_of_sale: 8, number: 77 },
          },
        },
      },
    ],
  ])("reads no credit note from %s", (_case, overrides) => {
    expect(saleVoidCreditNoteOfEvent(event(overrides))).toBeNull();
  });
});
