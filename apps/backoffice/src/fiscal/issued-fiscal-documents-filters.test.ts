import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  isDocumentNumberText,
  issuedFiscalDocumentsFilters,
} from "./issued-fiscal-documents-filters";

test("opens on every kind, every register, the cloud's own period, no number and the first page", () => {
  expect(issuedFiscalDocumentsFilters.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    kind: "ALL",
    number: "",
    page: 1,
  });
});

test("keeps the period, register, kind, number and page a URL names", () => {
  const filters = {
    from: "2026-09-01",
    to: "2026-09-30",
    register: FRONT_REGISTER_ID,
    kind: "credit_note",
    number: "41",
    page: "3",
  };

  expect(issuedFiscalDocumentsFilters.parse(filters)).toEqual({ ...filters, page: 3 });
});

test.each([
  ["a kind that is not offered", { kind: "invoice" }, { kind: "ALL" }],
  ["a number that is not text", { number: { a: 1 } }, { number: "" }],
  ["a number that is not a document number", { number: "abc" }, { number: "" }],
  ["a number starting with zero", { number: "0041" }, { number: "" }],
  ["a number longer than the cloud searches by", { number: "1000000000" }, { number: "" }],
  ["a page that is not a positive whole number", { page: "0" }, { page: 1 }],
  ["a page that is not whole", { page: "1.5" }, { page: 1 }],
  ["a page written as text", { page: "two" }, { page: 1 }],
  ["a page longer than the cloud reads", { page: "1000000000" }, { page: 1 }],
  [
    "a period the cloud would refuse",
    { from: "2026-09-30", to: "2026-09-01" },
    { from: "", to: "" },
  ],
])("falls back to the default for %s", (_name, search, expected) => {
  expect(issuedFiscalDocumentsFilters.parse(search)).toMatchObject(expected);
});

test("keeps a page it already parsed, as the router hands the filters back", () => {
  expect(issuedFiscalDocumentsFilters.parse({ page: 3 })).toMatchObject({ page: 3 });
});

test.each([
  ["", true],
  ["41", true],
  ["abc", false],
  ["0041", false],
])("tells whether %j is a document number: %s", (text, expected) => {
  expect(isDocumentNumberText(text)).toBe(expected);
});
