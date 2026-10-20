import { describe, expect, it } from "vitest";
import {
  type DiscountedLinesOfPromotion,
  promotionDiscountTotals,
  salesOfPromotions,
} from "./sales-by-promotion.js";

const terms = {
  benefit: { kind: "PERCENT_OFF", percent: 10 },
  target: { kind: "CATEGORY", name: "Almacén" },
  weekdays: [6, 7],
} as const;

function discounted(
  promotionId: string,
  name: string | null,
  lines: number,
  discountedAmount: number,
  options: Partial<DiscountedLinesOfPromotion> = {},
): DiscountedLinesOfPromotion {
  return {
    promotionId,
    name,
    terms: null,
    weightSource: null,
    quantity: lines,
    lines,
    discounted: discountedAmount,
    ...options,
  };
}

describe("salesOfPromotions", () => {
  it("counts the quantity of a line without a weight source in units", () => {
    expect(salesOfPromotions([discounted("p1", "Finde", 2, 500, { quantity: 7, terms })])).toEqual([
      {
        promotionId: "p1",
        name: "Finde",
        terms,
        lines: 2,
        units: 7,
        thousandths: 0,
        discounted: 500,
      },
    ]);
  });

  it.each(["SCALE", "MANUAL"] as const)(
    "counts the quantity of a line weighed by %s in thousandths of a kilogram",
    (weightSource) => {
      expect(
        salesOfPromotions([discounted("p1", "Fiambre", 1, 900, { weightSource, quantity: 1_250 })]),
      ).toEqual([
        {
          promotionId: "p1",
          name: "Fiambre",
          terms: null,
          lines: 1,
          units: 0,
          thousandths: 1_250,
          discounted: 900,
        },
      ]);
    },
  );

  it("adds the lines, units, weight and amount of the rows of one promotion", () => {
    expect(
      salesOfPromotions([
        discounted("p1", "Finde", 2, 500, { quantity: 3, terms }),
        discounted("p1", "Finde", 1, 300, { quantity: 400, weightSource: "SCALE", terms }),
        discounted("p1", "Finde", 4, 100, { quantity: 6, terms }),
        discounted("p1", "Finde", 1, 50, { quantity: 250, weightSource: "MANUAL", terms }),
      ]),
    ).toEqual([
      {
        promotionId: "p1",
        name: "Finde",
        terms,
        lines: 8,
        units: 9,
        thousandths: 650,
        discounted: 950,
      },
    ]);
  });

  it("keeps different promotions apart", () => {
    expect(
      salesOfPromotions([discounted("p1", "A", 1, 100), discounted("p2", "B", 1, 200)]).map(
        (row) => row.promotionId,
      ),
    ).toEqual(["p2", "p1"]);
  });

  it("orders the promotions by amount discounted, the largest first", () => {
    expect(
      salesOfPromotions([
        discounted("a", "A", 9, 100),
        discounted("b", "B", 1, 900),
        discounted("c", "C", 5, 500),
      ]).map((row) => row.promotionId),
    ).toEqual(["b", "c", "a"]);
  });

  it("orders promotions with the same amount by name, comparing code units", () => {
    expect(
      salesOfPromotions([discounted("p1", "Ángel", 1, 100), discounted("p2", "Zoe", 1, 100)]).map(
        (row) => row.name,
      ),
    ).toEqual(["Zoe", "Ángel"]);
  });

  it("puts a promotion without a name after the named ones on a tie", () => {
    expect(
      salesOfPromotions([
        discounted("p1", null, 1, 100),
        discounted("p2", "Zoe", 1, 100),
        discounted("p3", null, 1, 100),
      ]).map((row) => row.promotionId),
    ).toEqual(["p2", "p1", "p3"]);
  });

  it("orders the last tie by promotion id, comparing code units", () => {
    expect(
      salesOfPromotions([discounted("a1", "Ana", 1, 100), discounted("B1", "Ana", 1, 100)]).map(
        (row) => row.promotionId,
      ),
    ).toEqual(["B1", "a1"]);
  });

  it("orders the same whatever order the rows arrive in", () => {
    const rows = [
      discounted("p1", "Ana", 1, 100),
      discounted("p2", "Beto", 1, 100),
      discounted("p3", null, 1, 100),
      discounted("p4", "Beto", 1, 300),
    ];

    expect(salesOfPromotions([...rows].reverse())).toEqual(salesOfPromotions(rows));
  });
});

describe("promotionDiscountTotals", () => {
  it("adds the amount discounted and the lines, and names the promotion with most lines", () => {
    const rows = salesOfPromotions([
      discounted("p1", "Finde", 2, 5_000),
      discounted("p2", "Dos por uno", 7, 1_000),
    ]);

    expect(promotionDiscountTotals(rows)).toEqual({
      discounted: 6_000,
      lines: 9,
      mostUsed: { promotionId: "p2", name: "Dos por uno", lines: 7 },
    });
  });

  it("breaks a tie of lines in favour of the larger amount discounted", () => {
    const rows = salesOfPromotions([
      discounted("p1", "A", 3, 100),
      discounted("p2", "B", 3, 900),
      discounted("p3", "C", 3, 500),
    ]);

    expect(promotionDiscountTotals(rows).mostUsed?.promotionId).toBe("p2");
  });

  it("breaks a tie of lines and amount by name, comparing code units and a missing name last", () => {
    const rows = salesOfPromotions([
      discounted("p1", null, 3, 100),
      discounted("p2", "Zoe", 3, 100),
      discounted("p3", "Ana", 3, 100),
    ]);

    expect(promotionDiscountTotals(rows).mostUsed?.promotionId).toBe("p3");
  });

  it("breaks the last tie by promotion id, whatever order the rows arrive in", () => {
    const rows = [discounted("b", "Ana", 3, 100), discounted("a", "Ana", 3, 100)];

    expect(promotionDiscountTotals(salesOfPromotions(rows)).mostUsed?.promotionId).toBe("a");
    expect(
      promotionDiscountTotals(salesOfPromotions([...rows].reverse())).mostUsed?.promotionId,
    ).toBe("a");
  });

  it("names no promotion without rows", () => {
    expect(promotionDiscountTotals([])).toEqual({ discounted: 0, lines: 0, mostUsed: null });
  });
});
