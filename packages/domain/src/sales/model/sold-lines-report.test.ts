import { describe, expect, it } from "vitest";
import { SALES_REPORT_GROUPS, salesOfGroups, soldTotals } from "./sold-lines-report.js";

const unitLines = (id: string | null, path: string[], quantity: number, amount: number) => ({
  id,
  path,
  weightSource: null,
  quantity,
  amount,
});

const weighedLines = (
  id: string | null,
  path: string[],
  quantity: number,
  amount: number,
  weightSource: "SCALE" | "MANUAL" = "SCALE",
) => ({ id, path, weightSource, quantity, amount });

describe("SALES_REPORT_GROUPS", () => {
  it("offers the product and the category", () => {
    expect(SALES_REPORT_GROUPS).toEqual(["product", "category"]);
  });
});

describe("salesOfGroups", () => {
  it("counts the quantity of a line without a weight source in units", () => {
    expect(salesOfGroups([unitLines("p1", ["Azúcar 1 kg"], 7, 14_000)])).toEqual([
      { id: "p1", path: ["Azúcar 1 kg"], units: 7, thousandths: 0, amount: 14_000 },
    ]);
  });

  it.each(["SCALE", "MANUAL"] as const)(
    "counts the quantity of a line weighed by %s in thousandths of a kilogram",
    (weightSource) => {
      expect(salesOfGroups([weighedLines("p2", ["Queso"], 1_250, 9_000, weightSource)])).toEqual([
        { id: "p2", path: ["Queso"], units: 0, thousandths: 1_250, amount: 9_000 },
      ]);
    },
  );

  it("adds the units, the weight and the amount of the rows of one group", () => {
    expect(
      salesOfGroups([
        unitLines("c1", ["Almacén", "Dulces"], 3, 3_000),
        weighedLines("c1", ["Almacén", "Dulces"], 500, 2_000),
        weighedLines("c1", ["Almacén", "Dulces"], 250, 1_000, "MANUAL"),
        unitLines("c1", ["Almacén", "Dulces"], 2, 500),
      ]),
    ).toEqual([
      { id: "c1", path: ["Almacén", "Dulces"], units: 5, thousandths: 750, amount: 6_500 },
    ]);
  });

  it("keeps the rows without an id together in one group of their own", () => {
    expect(
      salesOfGroups([
        unitLines(null, [], 1, 100),
        unitLines("c1", ["Almacén"], 1, 300),
        weighedLines(null, [], 400, 200),
      ]),
    ).toEqual([
      { id: "c1", path: ["Almacén"], units: 1, thousandths: 0, amount: 300 },
      { id: null, path: [], units: 1, thousandths: 400, amount: 300 },
    ]);
  });

  it("orders the groups by amount, the largest first", () => {
    expect(
      salesOfGroups([
        unitLines("a", ["A"], 1, 100),
        unitLines("b", ["B"], 1, 900),
        unitLines("c", ["C"], 1, 500),
      ]).map((sales) => sales.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("orders groups of the same amount by their path", () => {
    expect(
      salesOfGroups([
        unitLines("z", ["Zeta"], 1, 100),
        unitLines("m2", ["Mate", "Yerba"], 1, 100),
        unitLines("m1", ["Mate"], 1, 100),
        unitLines("a", ["Aceite"], 1, 100),
      ]).map((sales) => sales.id),
    ).toEqual(["a", "m1", "m2", "z"]);
  });

  it("is empty without rows", () => {
    expect(salesOfGroups([])).toEqual([]);
  });
});

describe("soldTotals", () => {
  it("adds up the units, the weight and the amount of every group", () => {
    expect(
      soldTotals([
        { id: "a", path: ["A"], units: 5, thousandths: 750, amount: 6_500 },
        { id: "b", path: ["B"], units: 2, thousandths: 1_000, amount: 1_500 },
      ]),
    ).toEqual({ units: 7, thousandths: 1_750, amount: 8_000 });
  });

  it("is zero without groups", () => {
    expect(soldTotals([])).toEqual({ units: 0, thousandths: 0, amount: 0 });
  });
});
