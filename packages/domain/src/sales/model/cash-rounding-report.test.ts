import { describe, expect, it } from "vitest";
import { cashRoundingRows, cashRoundingTotals } from "./cash-rounding-report.js";

const record = (overrides: Partial<Parameters<typeof cashRoundingRows>[0][number]> = {}) => ({
  day: "2026-10-06",
  registerId: "r1",
  registerName: "Caja 1",
  rounded: 150,
  roundedSaleCount: 2,
  ...overrides,
});

describe("cashRoundingRows", () => {
  it("orders the rows by day and, within a day, by register name", () => {
    const rows = cashRoundingRows([
      record({ day: "2026-10-06", registerId: "r2", registerName: "Caja 2" }),
      record({ day: "2026-10-07", registerId: "r1", registerName: "Caja 1" }),
      record({ day: "2026-10-06", registerId: "r1", registerName: "Caja 1" }),
    ]);

    expect(rows.map((row) => [row.day, row.registerName])).toEqual([
      ["2026-10-06", "Caja 1"],
      ["2026-10-06", "Caja 2"],
      ["2026-10-07", "Caja 1"],
    ]);
  });

  it("orders names the Spanish way and falls back to the register id for equal names", () => {
    const rows = cashRoundingRows([
      record({ registerId: "b", registerName: "Zeta" }),
      record({ registerId: "z", registerName: "Árbol" }),
      record({ registerId: "a", registerName: "Árbol" }),
    ]);

    expect(rows.map((row) => row.registerId)).toEqual(["a", "z", "b"]);
  });

  it("keeps the amount and the count of each row and leaves the input untouched", () => {
    const input = [record({ rounded: 70, roundedSaleCount: 1 })];

    expect(cashRoundingRows(input)).toEqual([record({ rounded: 70, roundedSaleCount: 1 })]);
    expect(cashRoundingRows(input)).not.toBe(input);
  });
});

describe("cashRoundingTotals", () => {
  it("adds up the amounts and the rounded sales of every row", () => {
    expect(
      cashRoundingTotals([
        record({ rounded: 150, roundedSaleCount: 2 }),
        record({ rounded: 70, roundedSaleCount: 1 }),
      ]),
    ).toEqual({ rounded: 220, roundedSaleCount: 3 });
  });

  it("is zero without rows", () => {
    expect(cashRoundingTotals([])).toEqual({ rounded: 0, roundedSaleCount: 0 });
  });
});
