import { describe, expect, it } from "vitest";
import { OFFLINE_SERIES_DOCUMENT_TYPES, voucherTypeOfDocumentType } from "./fiscal-voucher-type.js";

describe("voucherTypeOfDocumentType", () => {
  it("is the tax authority's code of a factura C", () => {
    expect(voucherTypeOfDocumentType("factura_c")).toBe(11);
  });

  it("is the tax authority's code of a credit note C", () => {
    expect(voucherTypeOfDocumentType("credit_note_c")).toBe(13);
  });
});

describe("OFFLINE_SERIES_DOCUMENT_TYPES", () => {
  it("lists the factura C and then the credit note C, the two series an offline point of sale numbers", () => {
    expect(OFFLINE_SERIES_DOCUMENT_TYPES).toEqual(["factura_c", "credit_note_c"]);
  });
});
