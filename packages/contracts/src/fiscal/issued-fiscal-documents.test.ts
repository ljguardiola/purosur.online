import { describe, expect, it } from "vitest";
import {
  issuedFiscalDocumentsQuerySchema,
  issuedFiscalDocumentsSchema,
} from "./issued-fiscal-documents.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";

describe("issuedFiscalDocumentsQuerySchema", () => {
  it("accepts a query asking for nothing", () => {
    expect(issuedFiscalDocumentsQuerySchema.parse({})).toEqual({});
  });

  it("reads the voucher number and the page written in the query string as numbers", () => {
    const query = {
      from: "2026-10-01",
      to: "2026-10-06",
      register_id: REGISTER_ID,
      kind: "credit_note",
      number: "12",
      page: "3",
    };

    expect(issuedFiscalDocumentsQuerySchema.parse(query)).toEqual({
      ...query,
      number: 12,
      page: 3,
    });
  });

  it.each([
    ["a range ending before it starts", { from: "2026-10-06", to: "2026-10-05" }],
    ["a kind that is neither", { kind: "invoice" }],
    ["a number with letters", { number: "12a" }],
    ["a number of zero", { number: "0" }],
    ["a negative page", { page: "-1" }],
    ["a page of zero", { page: "0" }],
    ["an empty number", { number: "" }],
    ["a register that is not an id", { register_id: "caja-1" }],
  ])("refuses %s", (_name, query) => {
    expect(issuedFiscalDocumentsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("issuedFiscalDocumentsSchema", () => {
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
    authorization: {
      kind: "caea",
      code: "21403471111111",
      fortnight_start: "2026-10-01",
      fortnight_end: "2026-10-15",
    },
    contingency: true,
    corrected_voucher: { voucher_type: 11, point_of_sale: 7, number: 12 },
  };
  const awaiting = {
    ...receipt,
    number: 13,
    authorization: null,
    state: "awaiting_authorization",
  };
  const listing = {
    range: { from: "2026-10-05", to: "2026-10-06" },
    documents: [receipt, creditNote, awaiting],
    total: 3,
    page_size: 50,
  };

  it("accepts receipts and credit notes, authorized by a CAE, by a CAEA or still awaited", () => {
    expect(issuedFiscalDocumentsSchema.parse(listing)).toEqual(listing);
  });

  it("accepts an issue time written with a zone offset", () => {
    const withOffset = {
      ...listing,
      documents: [{ ...receipt, issued_at: "2026-10-05T10:00:00-03:00" }],
      total: 1,
    };

    expect(issuedFiscalDocumentsSchema.parse(withOffset)).toEqual(withOffset);
  });

  it("accepts a range without documents", () => {
    const empty = { ...listing, documents: [], total: 0 };

    expect(issuedFiscalDocumentsSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ["a state that is not listed", { state: "rejected" }],
    ["a kind that is neither", { kind: "invoice" }],
    ["an issue day that is not a calendar day", { issued_on: "2026-02-30" }],
    ["an issue time without a zone", { issued_at: "2026-10-05T13:00:00" }],
    ["an amount with decimals", { total: 10.5 }],
    ["an authorization of another kind", { authorization: { kind: "cai", code: "1" } }],
    [
      "an empty authorization code",
      { authorization: { kind: "cae", code: "", due_on: "2026-10-15" } },
    ],
    ["a point of sale of zero", { point_of_sale: 0 }],
    [
      "a corrected voucher without its number",
      { corrected_voucher: { voucher_type: 11, point_of_sale: 7 } },
    ],
  ])("refuses a document with %s", (_name, change) => {
    expect(
      issuedFiscalDocumentsSchema.safeParse({ ...listing, documents: [{ ...receipt, ...change }] })
        .success,
    ).toBe(false);
  });

  it.each([
    ["a negative total", { total: -1 }],
    ["a page size of zero", { page_size: 0 }],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses a listing with %s", (_name, change) => {
    expect(issuedFiscalDocumentsSchema.safeParse({ ...listing, ...change }).success).toBe(false);
  });
});
