import { describe, expect, it } from "vitest";
import { voucherTypeOfDocumentType } from "./fiscal-voucher-type.js";

describe("voucherTypeOfDocumentType", () => {
  it("is the tax authority's code of a factura C", () => {
    expect(voucherTypeOfDocumentType("factura_c")).toBe(11);
  });

  it("is the tax authority's code of a credit note C", () => {
    expect(voucherTypeOfDocumentType("credit_note_c")).toBe(13);
  });
});
