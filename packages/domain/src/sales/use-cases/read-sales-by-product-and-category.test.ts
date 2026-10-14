import { describe, expect, it } from "vitest";
import { readSalesByProductAndCategory } from "./read-sales-by-product-and-category.js";
import { FakeProductSalesReportReader } from "./test-support/fake-product-sales-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

const ofProducts = [
  { id: "p1", path: ["Azúcar 1 kg"], weightSource: null, quantity: 4, amount: 9_600 },
  {
    id: "p2",
    path: ["Queso cremoso"],
    weightSource: "SCALE" as const,
    quantity: 1_500,
    amount: 18_000,
  },
  { id: "p1", path: ["Azúcar 1 kg"], weightSource: null, quantity: 1, amount: 2_400 },
];

const ofCategories = [
  { id: "c1", path: ["Almacén", "Dulces"], weightSource: null, quantity: 2, amount: 500 },
  { id: null, path: [], weightSource: "MANUAL" as const, quantity: 300, amount: 700 },
];

describe("readSalesByProductAndCategory", () => {
  it("folds the products sold in the asked range into units, weight and amount", async () => {
    const reader = new FakeProductSalesReportReader({ products: ofProducts });

    const report = await readSalesByProductAndCategory(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
        group: "product",
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      group: "product",
      rows: [
        { id: "p2", path: ["Queso cremoso"], units: 0, thousandths: 1_500, amount: 18_000 },
        { id: "p1", path: ["Azúcar 1 kg"], units: 5, thousandths: 0, amount: 12_000 },
      ],
      totals: { units: 5, thousandths: 1_500, amount: 30_000 },
    });
    expect(reader.productReads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
    expect(reader.categoryReads).toEqual([]);
  });

  it("reads the categories when the report is grouped by category", async () => {
    const reader = new FakeProductSalesReportReader({
      products: ofProducts,
      categories: ofCategories,
    });

    const report = await readSalesByProductAndCategory(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined, group: "category" },
    );

    expect(report.group).toBe("category");
    expect(report.rows).toEqual([
      { id: null, path: [], units: 0, thousandths: 300, amount: 700 },
      { id: "c1", path: ["Almacén", "Dulces"], units: 2, thousandths: 0, amount: 500 },
    ]);
    expect(report.totals).toEqual({ units: 2, thousandths: 300, amount: 1_200 });
    expect(reader.productReads).toEqual([]);
    expect(reader.categoryReads).toHaveLength(1);
  });

  it("asks for the current day of the clock when no range is asked", async () => {
    const reader = new FakeProductSalesReportReader();

    const report = await readSalesByProductAndCategory(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined, group: "product" },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.productReads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakeProductSalesReportReader();

    await readSalesByProductAndCategory(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2", group: "category" },
    );

    expect(reader.categoryReads[0]?.registerId).toBe("register-2");
  });

  it("reports no rows and zero totals for a range without sales", async () => {
    const report = await readSalesByProductAndCategory(
      { reader: new FakeProductSalesReportReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined, group: "product" },
    );

    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({ units: 0, thousandths: 0, amount: 0 });
  });
});
