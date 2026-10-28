import { describe, expect, it } from "vitest";
import {
  issuedFiscalDocumentDetailSchema,
  issuedFiscalDocumentPathSchema,
} from "./issued-fiscal-document-detail.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";

describe("issuedFiscalDocumentPathSchema", () => {
  it("reads the voucher written in the path as numbers", () => {
    expect(
      issuedFiscalDocumentPathSchema.parse({
        voucher_type: "11",
        point_of_sale: "7",
        number: "12",
      }),
    ).toEqual({ voucher_type: 11, point_of_sale: 7, number: 12 });
  });

  it.each([
    ["a voucher type with letters", { voucher_type: "1a", point_of_sale: "7", number: "12" }],
    ["a voucher type of zero", { voucher_type: "0", point_of_sale: "7", number: "12" }],
    ["a point of sale of zero", { voucher_type: "11", point_of_sale: "0", number: "12" }],
    [
      "a point of sale above the largest",
      { voucher_type: "11", point_of_sale: "100000", number: "12" },
    ],
    ["a negative number", { voucher_type: "11", point_of_sale: "7", number: "-1" }],
    ["an empty number", { voucher_type: "11", point_of_sale: "7", number: "" }],
    ["a missing number", { voucher_type: "11", point_of_sale: "7" }],
  ])("refuses %s", (_name, path) => {
    expect(issuedFiscalDocumentPathSchema.safeParse(path).success).toBe(false);
  });
});

describe("issuedFiscalDocumentDetailSchema", () => {
  const receipt = {
    kind: "receipt",
    voucher_type: 11,
    point_of_sale: 7,
    number: 12,
    issued_on: "2026-10-05",
    issued_at: "2026-10-05T13:00:00.000Z",
    register: { id: REGISTER_ID, name: "Caja 1" },
    authorization: { kind: "cae", code: "75123456789012", due_on: "2026-10-15" },
    state: "authorized",
    contingency: false,
    total: 4_800,
    corrected_voucher: null,
  };
  const creditNote = {
    ...receipt,
    kind: "credit_note",
    voucher_type: 13,
    number: 3,
    corrected_voucher: { voucher_type: 11, point_of_sale: 7, number: 12 },
  };
  const detail = {
    ...receipt,
    buyer: { kind: "final_consumer" },
    lines: [
      {
        product_name: "Yerba 1 kg",
        sale_unit: "UNIT",
        quantity: 2,
        promotion: null,
        amount: 3_000,
      },
      {
        product_name: "Queso cremoso",
        sale_unit: "KG",
        quantity: 450,
        promotion: { name: "Lácteos 2x1" },
        amount: 1_800,
      },
    ],
    sale_total: 4_800,
    payments: [
      { method: "CASH", card_type: null, amount: 3_800 },
      { method: "POINT", card_type: "DEBIT", amount: 1_000 },
    ],
    credit_notes: [creditNote],
  };

  it("accepts a receipt with lines sold by unit and by weight, payments and credit notes", () => {
    expect(issuedFiscalDocumentDetailSchema.parse(detail)).toEqual(detail);
  });

  it("accepts a credit note with the voucher it corrects and no credit notes of its own", () => {
    const detailOfCreditNote = { ...detail, ...creditNote, credit_notes: [] };

    expect(issuedFiscalDocumentDetailSchema.parse(detailOfCreditNote)).toEqual(detailOfCreditNote);
  });

  it("accepts a document whose sale is not known yet", () => {
    const withoutSale = { ...detail, sale_total: null };

    expect(issuedFiscalDocumentDetailSchema.parse(withoutSale)).toEqual(withoutSale);
  });

  it("accepts a sale total of zero", () => {
    const free = { ...detail, sale_total: 0 };

    expect(issuedFiscalDocumentDetailSchema.parse(free)).toEqual(free);
  });

  it("accepts an identified buyer", () => {
    const identified = {
      ...detail,
      buyer: { kind: "identified", document_kind: "dni", document_number: 12_345_678 },
    };

    expect(issuedFiscalDocumentDetailSchema.parse(identified)).toEqual(identified);
  });

  it("accepts a document without lines or payments", () => {
    const bare = { ...detail, lines: [], payments: [], credit_notes: [] };

    expect(issuedFiscalDocumentDetailSchema.parse(bare)).toEqual(bare);
  });

  it.each([
    ["a buyer of another kind", { buyer: { kind: "company" } }],
    [
      "an identified buyer without a number",
      { buyer: { kind: "identified", document_kind: "dni" } },
    ],
    [
      "an identified buyer of a document kind it does not name",
      { buyer: { kind: "identified", document_kind: "passport", document_number: 1 } },
    ],
    [
      "an identified buyer named by the tax authority's document type",
      { buyer: { kind: "identified", document_type: 96, document_number: 12_345_678 } },
    ],
    [
      "a line sold by another unit",
      {
        lines: [{ product_name: "A", sale_unit: "LITER", quantity: 1, promotion: null, amount: 1 }],
      },
    ],
    [
      "a line of zero units",
      {
        lines: [{ product_name: "A", sale_unit: "UNIT", quantity: 0, promotion: null, amount: 1 }],
      },
    ],
    [
      "a line of fractional grams",
      {
        lines: [{ product_name: "A", sale_unit: "KG", quantity: 10.5, promotion: null, amount: 1 }],
      },
    ],
    [
      "a line of zero grams",
      {
        lines: [{ product_name: "A", sale_unit: "KG", quantity: 0, promotion: null, amount: 1 }],
      },
    ],
    [
      "a line with a negative amount",
      {
        lines: [{ product_name: "A", sale_unit: "UNIT", quantity: 1, promotion: null, amount: -1 }],
      },
    ],
    [
      "a line with a promotion without a name",
      {
        lines: [{ product_name: "A", sale_unit: "UNIT", quantity: 1, promotion: {}, amount: 1 }],
      },
    ],
    [
      "a payment with an unknown method",
      { payments: [{ method: "CHEQUE", card_type: null, amount: 1 }] },
    ],
    [
      "a payment with an unknown card type",
      { payments: [{ method: "POINT", card_type: "PREPAID", amount: 1 }] },
    ],
    ["a payment without a card type", { payments: [{ method: "CASH", amount: 1 }] }],
    ["a payment of zero", { payments: [{ method: "CASH", card_type: null, amount: 0 }] }],
    ["a credit note that is not a document", { credit_notes: [{ number: 1 }] }],
    ["a negative sale total", { sale_total: -1 }],
    ["a fractional sale total", { sale_total: 10.5 }],
    ["a sale total written as text", { sale_total: "4800" }],
    ["no sale total", { sale_total: undefined }],
    ["no lines", { lines: undefined }],
    ["no payments", { payments: undefined }],
    ["no credit notes", { credit_notes: undefined }],
    ["no buyer", { buyer: undefined }],
  ])("refuses %s", (_name, change) => {
    expect(issuedFiscalDocumentDetailSchema.safeParse({ ...detail, ...change }).success).toBe(
      false,
    );
  });
});
