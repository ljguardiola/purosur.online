import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  cheapestOffer,
  compareFractions,
  DEFAULT_SUPPLIER_ITEM_VAT_RATE,
  isSupplierItemVatRate,
  normalizeSupplierItemDescription,
  pricePerSaleUnit,
  requiresVatRate,
  SUPPLIER_ITEM_VAT_RATES,
  supplierItemKey,
} from "./supplier-item.js";

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
        expect(normalizeSupplierItemDescription(noisy)).toBe(
          normalizeSupplierItemDescription(text),
        );
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

  it.each([null, "", "   ", "\t\n"])(
    "identifies an item with the code %j by its normalized description",
    (code) => {
      expect(supplierItemKey({ code, description: "  Yerbá   MATE 1 Kg" })).toEqual({
        kind: "description",
        value: "yerba mate 1 kg",
      });
    },
  );

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

describe("supplier item VAT rates", () => {
  it("offers 21% and 10.5% as exact basis points, 21% by default", () => {
    expect(SUPPLIER_ITEM_VAT_RATES).toEqual([2100, 1050]);
    expect(DEFAULT_SUPPLIER_ITEM_VAT_RATE).toBe(2100);
  });

  it.each([2100, 1050])("accepts the rate %s", (rate) => {
    expect(isSupplierItemVatRate(rate)).toBe(true);
  });

  it.each([0, 21, 10.5, 2101, -2100, Number.NaN])("refuses the rate %s", (rate) => {
    expect(isSupplierItemVatRate(rate)).toBe(false);
  });
});

describe("requiresVatRate", () => {
  it("asks for a rate when the list's prices exclude VAT", () => {
    expect(requiresVatRate(false)).toBe(true);
  });

  it("asks for a rate while the list does not say whether its prices include VAT", () => {
    expect(requiresVatRate(null)).toBe(true);
  });

  it("asks for no rate when the list's prices include VAT", () => {
    expect(requiresVatRate(true)).toBe(false);
  });
});

describe("pricePerSaleUnit", () => {
  it("divides a VAT-included price by the sale units of the package, as a reduced fraction", () => {
    expect(
      pricePerSaleUnit({
        priceCents: 1_000,
        pricesIncludeVat: true,
        vatRate: null,
        quantityPerPackage: 3_000,
      }),
    ).toEqual({ numerator: 1_000n, denominator: 3n });
  });

  it("adds the rate to a price that excludes VAT exactly", () => {
    expect(
      pricePerSaleUnit({
        priceCents: 1_000,
        pricesIncludeVat: false,
        vatRate: 1050,
        quantityPerPackage: 1_000,
      }),
    ).toEqual({ numerator: 1_105n, denominator: 10n });
  });

  it("ignores the rate of a list whose prices include VAT", () => {
    expect(
      pricePerSaleUnit({
        priceCents: 1_000,
        pricesIncludeVat: true,
        vatRate: 2100,
        quantityPerPackage: 1_000,
      }),
    ).toEqual({ numerator: 1_000n, denominator: 1n });
  });

  it("has no price while the price excludes VAT and no rate is known", () => {
    expect(
      pricePerSaleUnit({
        priceCents: 1_000,
        pricesIncludeVat: false,
        vatRate: null,
        quantityPerPackage: 1_000,
      }),
    ).toBeNull();
  });

  it("treats a list that does not say whether its prices include VAT as excluding them", () => {
    expect(
      pricePerSaleUnit({
        priceCents: 1_000,
        pricesIncludeVat: null,
        vatRate: null,
        quantityPerPackage: 1_000,
      }),
    ).toBeNull();
    expect(
      pricePerSaleUnit({
        priceCents: 1_000,
        pricesIncludeVat: null,
        vatRate: 2100,
        quantityPerPackage: 1_000,
      }),
    ).toEqual({ numerator: 121n, denominator: 1n });
  });

  it("prices a package of half a sale unit at twice its price", () => {
    expect(
      pricePerSaleUnit({
        priceCents: 500,
        pricesIncludeVat: true,
        vatRate: null,
        quantityPerPackage: 500,
      }),
    ).toEqual({ numerator: 1_000n, denominator: 1n });
  });

  it("equals the exact quotient for any price, package size and rate", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.constantFrom(2100, 1050),
        (priceCents, quantityPerPackage, vatRate) => {
          const fraction = pricePerSaleUnit({
            priceCents,
            pricesIncludeVat: false,
            vatRate,
            quantityPerPackage,
          });

          expect(fraction?.denominator).toBeGreaterThan(0n);
          expect(
            compareFractions(fraction ?? { numerator: -1n, denominator: 1n }, {
              numerator: BigInt(priceCents) * BigInt(10_000 + vatRate) * 1_000n,
              denominator: 10_000n * BigInt(quantityPerPackage),
            }),
          ).toBe(0);
        },
      ),
    );
  });
});

describe("compareFractions", () => {
  it("orders fractions by value whatever their reduction", () => {
    expect(
      compareFractions({ numerator: 1n, denominator: 3n }, { numerator: 1n, denominator: 2n }),
    ).toBeLessThan(0);
    expect(
      compareFractions({ numerator: 2n, denominator: 3n }, { numerator: 1n, denominator: 2n }),
    ).toBeGreaterThan(0);
    expect(
      compareFractions({ numerator: 2n, denominator: 4n }, { numerator: 1n, denominator: 2n }),
    ).toBe(0);
  });

  it("agrees with the sign of the difference of the values for any two fractions", () => {
    const fraction = fc.record({
      numerator: fc.bigInt({ min: 0n, max: 10n ** 12n }),
      denominator: fc.bigInt({ min: 1n, max: 10n ** 12n }),
    });
    fc.assert(
      fc.property(fraction, fraction, (a, b) => {
        const difference = a.numerator * b.denominator - b.numerator * a.denominator;
        expect(Math.sign(compareFractions(a, b))).toBe(
          difference > 0n ? 1 : difference < 0n ? -1 : 0,
        );
      }),
    );
  });
});

describe("cheapestOffer", () => {
  const offer = (name: string, numerator: bigint, denominator: bigint) => ({
    name,
    pricePerSaleUnit: { numerator, denominator },
  });

  it("answers nothing without offers", () => {
    expect(cheapestOffer([])).toBeUndefined();
  });

  it("answers the offer with the lowest price per sale unit", () => {
    const offers = [offer("a", 1n, 2n), offer("b", 1n, 3n), offer("c", 3n, 4n)];

    expect(cheapestOffer(offers)?.name).toBe("b");
  });

  it("keeps the earliest offer among equally cheap ones", () => {
    const offers = [offer("a", 2n, 4n), offer("b", 1n, 2n), offer("c", 1n, 2n)];

    expect(cheapestOffer(offers)?.name).toBe("a");
  });
});
