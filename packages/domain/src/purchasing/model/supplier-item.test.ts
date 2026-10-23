import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  cheapestOffer,
  compareFractions,
  DEFAULT_SUPPLIER_ITEM_VAT_RATE,
  isSupplierItemVatRate,
  lastRowOfEachItem,
  needsReview,
  normalizeSupplierItemDescription,
  pricePerSaleUnit,
  requiresVatRate,
  SUPPLIER_ITEM_VAT_RATES,
  SUPPLIER_PRICE_LIST_ROW_STATUSES,
  sameSupplierItemKey,
  supplierItemKey,
  supplierPriceListRowStatus,
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
        priceCents: 1_001,
        pricesIncludeVat: false,
        vatRate: 1050,
        quantityPerPackage: 3_000,
      }),
    ).toEqual({ numerator: 221_221n, denominator: 600n });
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
    ).toEqual({ numerator: 1_210n, denominator: 1n });
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

describe("supplierPriceListRowStatus", () => {
  const earlier = { description: "Yerba 1 kg", priceCents: 1_000 };
  const row = {
    reviewed: false,
    description: "Yerba 1 kg",
    priceCents: 1_000 as number | null,
    link: { vatRate: null as number | null } as { vatRate: number | null } | null,
    earlier: earlier as { description: string; priceCents: number } | null,
    requiresVatRate: false,
  };

  it("names the statuses", () => {
    expect(SUPPLIER_PRICE_LIST_ROW_STATUSES).toEqual([
      "new",
      "linked",
      "price_changed",
      "description_changed",
      "unlinked",
      "vat_rate_missing",
      "reviewed",
    ]);
  });

  it("is new when no earlier list of the supplier had the item", () => {
    expect(supplierPriceListRowStatus({ ...row, earlier: null, link: null })).toBe("new");
  });

  it("is linked when a remembered link meets the same price and description", () => {
    expect(supplierPriceListRowStatus(row)).toBe("linked");
  });

  it("is unlinked when the item was seen before but never linked", () => {
    expect(supplierPriceListRowStatus({ ...row, link: null })).toBe("unlinked");
  });

  it("is unlinked even when the price changed, since the link is what is missing", () => {
    expect(supplierPriceListRowStatus({ ...row, link: null, priceCents: 1_100 })).toBe("unlinked");
  });

  it("is price_changed when the price differs", () => {
    expect(supplierPriceListRowStatus({ ...row, priceCents: 1_001 })).toBe("price_changed");
  });

  it("is price_changed when the row lost its price", () => {
    expect(supplierPriceListRowStatus({ ...row, priceCents: null })).toBe("price_changed");
  });

  it("is description_changed for any difference in the printed description", () => {
    expect(supplierPriceListRowStatus({ ...row, description: "yerba 1 kg" })).toBe(
      "description_changed",
    );
    expect(supplierPriceListRowStatus({ ...row, description: "Yerba 1 kg " })).toBe(
      "description_changed",
    );
  });

  it("checks the price before the description", () => {
    expect(
      supplierPriceListRowStatus({ ...row, priceCents: 1_100, description: "Yerba 500 g" }),
    ).toBe("price_changed");
  });

  it("is vat_rate_missing when the list needs a rate and the remembered link has none", () => {
    expect(supplierPriceListRowStatus({ ...row, requiresVatRate: true })).toBe("vat_rate_missing");
  });

  it("is linked when the list needs a rate and the remembered link has one", () => {
    expect(
      supplierPriceListRowStatus({ ...row, requiresVatRate: true, link: { vatRate: 1050 } }),
    ).toBe("linked");
  });

  it("is linked without a rate when the list's prices include VAT", () => {
    expect(supplierPriceListRowStatus({ ...row, requiresVatRate: false })).toBe("linked");
  });

  it("reports a changed price before a missing rate", () => {
    expect(supplierPriceListRowStatus({ ...row, requiresVatRate: true, priceCents: 1_100 })).toBe(
      "price_changed",
    );
  });

  it("is reviewed once a person linked the row or marked it reviewed, whatever else is true", () => {
    for (const changes of [
      {},
      { earlier: null, link: null },
      { link: null },
      { priceCents: 5 },
      { description: "otra" },
      { requiresVatRate: true },
    ]) {
      expect(supplierPriceListRowStatus({ ...row, ...changes, reviewed: true })).toBe("reviewed");
    }
  });
});

describe("needsReview", () => {
  it("is false only for a row linked automatically and one a person reviewed", () => {
    expect(SUPPLIER_PRICE_LIST_ROW_STATUSES.filter((status) => needsReview(status))).toEqual([
      "new",
      "price_changed",
      "description_changed",
      "unlinked",
      "vat_rate_missing",
    ]);
  });
});

describe("lastRowOfEachItem", () => {
  const row = (id: string, code: string | null, description: string) => ({
    id,
    code,
    description,
  });

  it("keeps one row per item, the last by position, in order of first appearance", () => {
    const rows = [
      row("1", "A", "Yerba"),
      row("2", null, "Azúcar  1 kg"),
      row("3", "A", "Yerba nueva"),
      row("4", null, "azucar 1 KG"),
      row("5", "B", "Fideos"),
    ];

    expect(lastRowOfEachItem(rows)).toEqual([
      { key: { kind: "code", value: "A" }, row: rows[2], rows: [rows[0], rows[2]] },
      {
        key: { kind: "description", value: "azucar 1 kg" },
        row: rows[3],
        rows: [rows[1], rows[3]],
      },
      { key: { kind: "code", value: "B" }, row: rows[4], rows: [rows[4]] },
    ]);
  });

  it("keeps a code and a description equal to it as different items", () => {
    const rows = [row("1", "yerba", "x"), row("2", null, "yerba")];

    expect(lastRowOfEachItem(rows)).toHaveLength(2);
  });

  it("answers nothing for no rows", () => {
    expect(lastRowOfEachItem([])).toEqual([]);
  });
});

describe("sameSupplierItemKey", () => {
  it("is true for the same kind and value", () => {
    expect(sameSupplierItemKey({ kind: "code", value: "A" }, { kind: "code", value: "A" })).toBe(
      true,
    );
  });

  it("is false for another value of the same kind", () => {
    expect(sameSupplierItemKey({ kind: "code", value: "A" }, { kind: "code", value: "B" })).toBe(
      false,
    );
  });

  it("is false for the same value of another kind", () => {
    expect(
      sameSupplierItemKey({ kind: "code", value: "a" }, { kind: "description", value: "a" }),
    ).toBe(false);
  });
});
