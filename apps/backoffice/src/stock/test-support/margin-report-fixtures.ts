import type { MarginReportBody } from "@purosur/contracts";

const DULCES_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FIAMBRES_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEBIDAS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const QUESO_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const YERBA_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

export const categoryMarginReport: MarginReportBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  group: "category",
  rows: [
    {
      id: DULCES_ID,
      path: ["Almacén", "Dulces"],
      brandName: null,
      netContent: null,
      amount: 410_000,
      cost: 250_000,
      margin: 160_000,
      incompleteSales: 0,
    },
    {
      id: FIAMBRES_ID,
      path: ["Fiambres"],
      brandName: null,
      netContent: null,
      amount: 300_000,
      cost: 180_000,
      margin: 120_000,
      incompleteSales: 2,
    },
    {
      id: BEBIDAS_ID,
      path: ["Bebidas"],
      brandName: null,
      netContent: null,
      amount: 190_000,
      cost: 200_000,
      margin: -10_000,
      incompleteSales: 0,
    },
    {
      id: null,
      path: [],
      brandName: null,
      netContent: null,
      amount: 100_000,
      cost: 40_000,
      margin: 60_000,
      incompleteSales: 0,
    },
  ],
  totals: { amount: 1_000_000, cost: 670_000, margin: 330_000, incompleteSales: 2 },
};

export const productMarginReport: MarginReportBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  group: "product",
  rows: [
    {
      id: QUESO_ID,
      path: ["Queso cremoso"],
      brandName: null,
      netContent: null,
      amount: 600_000,
      cost: 360_000,
      margin: 240_000,
      incompleteSales: 0,
    },
    {
      id: YERBA_ID,
      path: ["Yerba mate"],
      brandName: "Hoja Alta",
      netContent: { quantity: 1, unit: "KG" },
      amount: 400_000,
      cost: 310_000,
      margin: 90_000,
      incompleteSales: 1,
    },
  ],
  totals: { amount: 1_000_000, cost: 670_000, margin: 330_000, incompleteSales: 1 },
};

export const completeMarginReport: MarginReportBody = {
  ...categoryMarginReport,
  rows: categoryMarginReport.rows.map((row) => ({ ...row, incompleteSales: 0 })),
  totals: { ...categoryMarginReport.totals, incompleteSales: 0 },
};

export const noMarginReport: MarginReportBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  group: "category",
  rows: [],
  totals: { amount: 0, cost: 0, margin: 0, incompleteSales: 0 },
};

export function manyMarginRowsReport(count: number): MarginReportBody {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    path: [`Producto ${String(index + 1).padStart(2, "0")}`],
    brandName: null,
    netContent: null,
    amount: (count - index) * 100,
    cost: (count - index) * 40,
    margin: (count - index) * 60,
    incompleteSales: 0,
  }));
  return {
    range: { from: "2026-10-01", to: "2026-10-07" },
    group: "product",
    rows,
    totals: {
      amount: rows.reduce((sum, row) => sum + row.amount, 0),
      cost: rows.reduce((sum, row) => sum + row.cost, 0),
      margin: rows.reduce((sum, row) => sum + row.margin, 0),
      incompleteSales: 0,
    },
  };
}
