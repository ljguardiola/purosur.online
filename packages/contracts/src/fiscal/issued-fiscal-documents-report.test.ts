import { describe, expect, it } from "vitest";
import {
  issuedFiscalDocumentsReportQuerySchema,
  issuedFiscalDocumentsReportSchema,
} from "./issued-fiscal-documents-report.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";

describe("issuedFiscalDocumentsReportQuerySchema", () => {
  it("accepts a query asking for nothing", () => {
    expect(issuedFiscalDocumentsReportQuerySchema.parse({})).toEqual({});
  });

  it("accepts a range of calendar days and a register", () => {
    const query = { from: "2026-10-01", to: "2026-10-06", register_id: REGISTER_ID };

    expect(issuedFiscalDocumentsReportQuerySchema.parse(query)).toEqual(query);
  });

  it.each([
    ["a range ending before it starts", { from: "2026-10-06", to: "2026-10-05" }],
    ["a start without an end", { from: "2026-10-06" }],
    ["a register that is not an id", { register_id: "caja-1" }],
  ])("refuses %s", (_name, query) => {
    expect(issuedFiscalDocumentsReportQuerySchema.safeParse(query).success).toBe(false);
  });
});

const receiptRow = {
  kind: "receipt",
  voucher_type: 11,
  point_of_sale: 7,
  authorization_kind: "cae",
  count: 3,
  amount: 9_000,
};

const creditNoteRow = {
  kind: "credit_note",
  voucher_type: 13,
  point_of_sale: 7,
  authorization_kind: "caea",
  count: 1,
  amount: -1_500,
};

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  rows: [receiptRow, creditNoteRow],
  totals: {
    receipts: { count: 3, amount: 9_000 },
    credit_notes: { count: 1, amount: -1_500 },
    amount: 7_500,
    contingency: { count: 1, share_tenths_of_percent: 250 },
  },
};

describe("issuedFiscalDocumentsReportSchema", () => {
  it("accepts receipts and credit notes of both authorization kinds with a signed amount", () => {
    expect(issuedFiscalDocumentsReportSchema.parse(report)).toEqual(report);
  });

  it("accepts a report of a period where nothing was issued", () => {
    const empty = {
      range: report.range,
      rows: [],
      totals: {
        receipts: { count: 0, amount: 0 },
        credit_notes: { count: 0, amount: 0 },
        amount: 0,
        contingency: { count: 0, share_tenths_of_percent: null },
      },
    };

    expect(issuedFiscalDocumentsReportSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a net amount below zero", () => {
    const negative = { ...report, totals: { ...report.totals, amount: -1 } };

    expect(issuedFiscalDocumentsReportSchema.safeParse(negative).success).toBe(true);
  });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a report without rows", { rows: undefined }],
    ["a report without totals", { totals: undefined }],
  ])("refuses %s", (_name, change) => {
    expect(issuedFiscalDocumentsReportSchema.safeParse({ ...report, ...change }).success).toBe(
      false,
    );
  });

  it.each([
    ["a kind that is neither receipt nor credit note", { kind: "debit_note" }],
    ["an authorization kind that is neither CAE nor CAEA", { authorization_kind: "cai" }],
    ["a voucher type that is not positive", { voucher_type: 0 }],
    ["a point of sale outside the valid numbers", { point_of_sale: 0 }],
    ["a negative count", { count: -1 }],
    ["a count with decimals", { count: 1.5 }],
    ["an amount with decimals", { amount: 10.5 }],
  ])("refuses a row with %s", (_name, change) => {
    const rows = [{ ...receiptRow, ...change }];

    expect(issuedFiscalDocumentsReportSchema.safeParse({ ...report, rows }).success).toBe(false);
  });

  it.each([
    ["a negative receipts count", { receipts: { count: -1, amount: 0 } }],
    ["a credit notes count with decimals", { credit_notes: { count: 0.5, amount: 0 } }],
    ["a net amount with decimals", { amount: 1.5 }],
    ["a negative contingency count", { contingency: { count: -1, share_tenths_of_percent: 0 } }],
    ["a share with decimals", { contingency: { count: 1, share_tenths_of_percent: 12.5 } }],
  ])("refuses totals with %s", (_name, change) => {
    const totals = { ...report.totals, ...change };

    expect(issuedFiscalDocumentsReportSchema.safeParse({ ...report, totals }).success).toBe(false);
  });
});
