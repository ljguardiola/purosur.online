import { expect, test } from "vitest";
import { caeaSearch, issuedFiscalDocumentsSearch } from "./routes";

test("names no assistant and no filter by default in CAEA y excepcionalidad", () => {
  expect(caeaSearch.parse({})).toEqual({ fiscalAddress: "" });
});

test("keeps the fiscal address, the year and the open assistant a URL names", () => {
  expect(
    caeaSearch.parse({
      fiscalAddress: "fiscal-address-central",
      year: "2025",
      assistant: "contingency-ticket-rescue",
    }),
  ).toEqual({
    fiscalAddress: "fiscal-address-central",
    year: 2025,
    assistant: "contingency-ticket-rescue",
  });
});

test("drops an assistant that CAEA y excepcionalidad does not have", () => {
  expect(caeaSearch.parse({ assistant: "compromise-response" })).toEqual({ fiscalAddress: "" });
});

test("opens no voucher by default in Comprobantes", () => {
  expect(issuedFiscalDocumentsSearch.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    kind: "ALL",
    number: "",
    page: 1,
  });
});

test("keeps the open voucher beside the filters a URL names", () => {
  expect(
    issuedFiscalDocumentsSearch.parse({ document: "6-3-123", kind: "receipt", page: 2 }),
  ).toEqual({
    from: "",
    to: "",
    register: "ALL",
    kind: "receipt",
    number: "",
    page: 2,
    document: "6-3-123",
  });
});

test("drops a voucher key that does not name a voucher", () => {
  expect(issuedFiscalDocumentsSearch.parse({ document: "abc" }).document).toBeUndefined();
});
