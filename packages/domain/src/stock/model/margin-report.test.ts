import { describe, expect, it } from "vitest";
import { type MarginAllocation, type MarginSaleLine, marginReport } from "./margin-report.js";

const lot = {
  technical: false,
  costIncomplete: false,
  cost: { totalCents: 5_000, quantity: 1_000 },
};

function allocation(overrides: Partial<MarginAllocation> & { quantity: number }): MarginAllocation {
  return { lotId: "lot-1", movementKind: "sale", ...lot, ...overrides };
}

function line(overrides: Partial<MarginSaleLine> = {}): MarginSaleLine {
  return {
    saleId: "sale-1",
    id: "p1",
    path: ["Azúcar 1 kg"],
    brandName: null,
    netContent: null,
    amount: 9_000,
    allocations: [],
    ...overrides,
  };
}

describe("marginReport", () => {
  it("reports no rows and zero totals without sold lines", () => {
    expect(marginReport([])).toEqual({
      rows: [],
      totals: { amount: 0, cost: 0, margin: 0, incompleteSales: 0 },
    });
  });

  it("subtracts the cost of the units sold from the amount, as a positive cost of sales", () => {
    const report = marginReport([line({ allocations: [allocation({ quantity: -2_000 })] })]);

    expect(report.rows).toEqual([
      {
        id: "p1",
        path: ["Azúcar 1 kg"],
        brandName: null,
        netContent: null,
        amount: 9_000,
        cost: 10_000,
        margin: -1_000,
        incompleteSales: 0,
      },
    ]);
    expect(report.totals).toEqual({
      amount: 9_000,
      cost: 10_000,
      margin: -1_000,
      incompleteSales: 0,
    });
  });

  it("adds up the cost of every lot a line took from, valued at each lot's own cost", () => {
    const cheap = { lotId: "cheap", cost: { totalCents: 1_000, quantity: 1_000 } };
    const dear = { lotId: "dear", cost: { totalCents: 3_000, quantity: 1_000 } };

    const report = marginReport([
      line({
        allocations: [
          allocation({ ...cheap, quantity: -1_000 }),
          allocation({ ...dear, quantity: -500 }),
        ],
      }),
    ]);

    expect(report.rows[0]?.cost).toBe(2_500);
  });

  it("rounds each lot's value half up to the cent", () => {
    const report = marginReport([
      line({
        allocations: [
          allocation({ lotId: "a", quantity: -1, cost: { totalCents: 1, quantity: 2 } }),
          allocation({ lotId: "b", quantity: -1, cost: { totalCents: 1, quantity: 2 } }),
        ],
      }),
    ]);

    expect(report.rows[0]?.cost).toBe(2);
  });

  it("nets the return of a line against its sale on the same lot", () => {
    const report = marginReport([
      line({
        amount: 4_500,
        allocations: [
          allocation({ quantity: -2_000 }),
          allocation({ movementKind: "return", quantity: 1_000 }),
        ],
      }),
    ]);

    expect(report.rows[0]).toMatchObject({ amount: 4_500, cost: 5_000, margin: -500 });
  });

  it("costs nothing for a line whose units all came back", () => {
    const report = marginReport([
      line({
        amount: 0,
        allocations: [
          allocation({ quantity: -2_000 }),
          allocation({ movementKind: "return", quantity: 2_000 }),
        ],
      }),
    ]);

    expect(report.rows[0]).toMatchObject({ amount: 0, cost: 0, margin: 0 });
  });

  it("leaves a lot with an unknown cost out of the cost and flags the sale", () => {
    const report = marginReport([
      line({
        allocations: [
          allocation({ lotId: "known", quantity: -1_000 }),
          allocation({ lotId: "unknown", quantity: -1_000, cost: null, costIncomplete: true }),
        ],
      }),
    ]);

    expect(report.rows[0]).toMatchObject({ amount: 9_000, cost: 5_000, margin: 4_000 });
    expect(report.rows[0]?.incompleteSales).toBe(1);
  });

  it("treats a technical lot as unknown even when it carries a cost", () => {
    const report = marginReport([
      line({ allocations: [allocation({ quantity: -1_000, technical: true })] }),
    ]);

    expect(report.rows[0]).toMatchObject({ cost: 0, incompleteSales: 1 });
  });

  it("treats a lot flagged incomplete as unknown even when it carries a cost", () => {
    const report = marginReport([
      line({ allocations: [allocation({ quantity: -1_000, costIncomplete: true })] }),
    ]);

    expect(report.rows[0]).toMatchObject({ cost: 0, incompleteSales: 1 });
  });

  it("flags a sale by the lots its sale movement took from, even when everything came back", () => {
    const report = marginReport([
      line({
        amount: 0,
        allocations: [
          allocation({ quantity: -1_000, costIncomplete: true }),
          allocation({ movementKind: "return", quantity: 1_000, costIncomplete: true }),
        ],
      }),
    ]);

    expect(report.rows[0]?.incompleteSales).toBe(1);
  });

  it("does not flag a sale for an incomplete lot only its return touched", () => {
    const report = marginReport([
      line({
        allocations: [
          allocation({ quantity: -1_000 }),
          allocation({
            movementKind: "return",
            quantity: 500,
            lotId: "other",
            costIncomplete: true,
          }),
        ],
      }),
    ]);

    expect(report.rows[0]?.incompleteSales).toBe(0);
  });

  it("counts a sale once in a row however many of its lines are incomplete", () => {
    const incomplete = [allocation({ quantity: -1_000, costIncomplete: true })];

    const report = marginReport([
      line({ saleId: "sale-1", allocations: incomplete }),
      line({ saleId: "sale-1", allocations: incomplete }),
      line({ saleId: "sale-2", allocations: incomplete }),
    ]);

    expect(report.rows[0]?.incompleteSales).toBe(2);
    expect(report.totals.incompleteSales).toBe(2);
  });

  it("counts a sale once in the totals when its incomplete lines fall in different rows", () => {
    const incomplete = [allocation({ quantity: -1_000, costIncomplete: true })];

    const report = marginReport([
      line({ saleId: "sale-1", id: "p1", allocations: incomplete }),
      line({ saleId: "sale-1", id: "p2", path: ["Sal"], allocations: incomplete }),
    ]);

    expect(report.rows.map((row) => row.incompleteSales)).toEqual([1, 1]);
    expect(report.totals.incompleteSales).toBe(1);
  });

  it("groups the lines by id, adding amounts and costs, and sorts the largest amount first", () => {
    const report = marginReport([
      line({
        id: "p1",
        path: ["Azúcar"],
        amount: 1_000,
        allocations: [allocation({ quantity: -200 })],
      }),
      line({
        id: "p2",
        path: ["Sal"],
        amount: 5_000,
        allocations: [allocation({ quantity: -200 })],
      }),
      line({
        id: "p1",
        path: ["Azúcar"],
        amount: 2_000,
        allocations: [allocation({ quantity: -400 })],
      }),
    ]);

    expect(
      report.rows.map(({ id, amount, cost, margin }) => ({ id, amount, cost, margin })),
    ).toEqual([
      { id: "p2", amount: 5_000, cost: 1_000, margin: 4_000 },
      { id: "p1", amount: 3_000, cost: 3_000, margin: 0 },
    ]);
    expect(report.totals).toEqual({
      amount: 8_000,
      cost: 4_000,
      margin: 4_000,
      incompleteSales: 0,
    });
  });

  it("breaks a tie of amounts by the path, then by the id", () => {
    const report = marginReport([
      line({ id: "b", path: ["Sal"], amount: 100 }),
      line({ id: "z", path: ["Arroz"], amount: 100 }),
      line({ id: "a", path: ["Arroz"], amount: 100 }),
    ]);

    expect(report.rows.map((row) => row.id)).toEqual(["a", "z", "b"]);
  });

  it("breaks a tie of amounts by comparing the path name by name, a parent before its children", () => {
    const report = marginReport([
      line({ id: "child", path: ["Almacén", "Dulces"], amount: 100 }),
      line({ id: "longer", path: ["Almacenes"], amount: 100 }),
      line({ id: "parent", path: ["Almacén"], amount: 100 }),
      line({ id: null, path: [], amount: 100 }),
    ]);

    expect(report.rows.map((row) => row.id)).toEqual([null, "parent", "child", "longer"]);
  });

  it("keeps the lines without a category in one row", () => {
    const report = marginReport([
      line({ id: null, path: [], amount: 100 }),
      line({ id: null, path: [], amount: 200 }),
    ]);

    expect(report.rows).toEqual([
      {
        id: null,
        path: [],
        brandName: null,
        netContent: null,
        amount: 300,
        cost: 0,
        margin: 300,
        incompleteSales: 0,
      },
    ]);
  });

  it("carries the brand name and net content of a product row", () => {
    const report = marginReport([
      line({ brandName: "Vitora", netContent: { quantity: 30, unit: "ML" } }),
    ]);

    expect(report.rows[0]).toMatchObject({
      brandName: "Vitora",
      netContent: { quantity: 30, unit: "ML" },
    });
  });
});
