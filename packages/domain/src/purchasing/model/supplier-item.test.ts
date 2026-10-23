import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeSupplierItemDescription, supplierItemKey } from "./supplier-item.js";

describe("normalizeSupplierItemDescription", () => {
  it("lowers the case, removes accents and collapses spaces", () => {
    expect(normalizeSupplierItemDescription("  AZÚCAR   Ledesma\t1 Kg \n")).toBe(
      "azucar ledesma 1 kg",
    );
  });

  it("removes the accent of a letter typed as base letter plus combining mark", () => {
    expect(normalizeSupplierItemDescription("Café")).toBe("cafe");
  });

  it("gives the same text for any extra spacing around the words", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 4 }), (text, spaces) => {
        const noisy = ` ${text.replace(/\s+/g, " ".repeat(spaces))} `;
        expect(normalizeSupplierItemDescription(noisy)).toBe(normalizeSupplierItemDescription(text));
      }),
    );
  });

  it("is stable when applied twice", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const once = normalizeSupplierItemDescription(text);
        expect(normalizeSupplierItemDescription(once)).toBe(once);
      }),
    );
  });
});

describe("supplierItemKey", () => {
  it("identifies an item by its code, trimmed and as printed", () => {
    expect(supplierItemKey({ code: "  Y-001a ", description: "Yerba 1 kg" })).toEqual({
      kind: "code",
      value: "Y-001a",
    });
  });

  it("keeps two codes that differ only in case apart", () => {
    expect(supplierItemKey({ code: "ab", description: "x" })).not.toEqual(
      supplierItemKey({ code: "AB", description: "x" }),
    );
  });

  it.each([
    null,
    "",
    "   ",
    "\t\n",
  ])("identifies an item with the code %j by its normalized description", (code) => {
    expect(supplierItemKey({ code, description: "  Yerbá   MATE 1 Kg" })).toEqual({
      kind: "description",
      value: "yerba mate 1 kg",
    });
  });

  it("ignores the description when the item has a code", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (first, second) => {
        expect(supplierItemKey({ code: "A-1", description: first })).toEqual(
          supplierItemKey({ code: "A-1", description: second }),
        );
      }),
    );
  });
});
