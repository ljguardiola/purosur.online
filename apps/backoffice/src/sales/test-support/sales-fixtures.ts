import type { SalesByProductAndCategoryBody, SalesReportBody } from "@purosur/contracts";

export const weekReport: SalesReportBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  days: [
    { day: "2026-10-02", sales_count: 3, total: 1_250_050 },
    { day: "2026-10-05", sales_count: 1, total: 98_000 },
  ],
  totals: { sales_count: 4, total: 1_348_050 },
};

export const todayReport: SalesReportBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  days: [],
  totals: { sales_count: 0, total: 0 },
};

const DULCES_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FIAMBRES_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEBIDAS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const QUESO_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const YERBA_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

export const categoryProductsReport: SalesByProductAndCategoryBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  group: "category",
  rows: [
    { id: DULCES_ID, path: ["Almacén", "Dulces"], units: 1_200, thousandths: 0, amount: 410_000 },
    { id: FIAMBRES_ID, path: ["Fiambres"], units: 42, thousandths: 186_400, amount: 300_000 },
    { id: BEBIDAS_ID, path: ["Bebidas"], units: 597, thousandths: 0, amount: 190_000 },
    { id: null, path: [], units: 3, thousandths: 0, amount: 100_000 },
  ],
  totals: { units: 1_842, thousandths: 186_400, amount: 1_000_000 },
};

export const productProductsReport: SalesByProductAndCategoryBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  group: "product",
  rows: [
    { id: QUESO_ID, path: ["Queso cremoso"], units: 0, thousandths: 12_500, amount: 600_000 },
    { id: YERBA_ID, path: ["Yerba mate 1 kg"], units: 80, thousandths: 0, amount: 400_000 },
  ],
  totals: { units: 80, thousandths: 12_500, amount: 1_000_000 },
};

export const noProductsReport: SalesByProductAndCategoryBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  group: "category",
  rows: [],
  totals: { units: 0, thousandths: 0, amount: 0 },
};

export function manyProductsReport(count: number): SalesByProductAndCategoryBody {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    path: [`Producto ${String(index + 1).padStart(2, "0")}`],
    units: 1,
    thousandths: 0,
    amount: (count - index) * 100,
  }));
  return {
    range: { from: "2026-10-01", to: "2026-10-07" },
    group: "product",
    rows,
    totals: {
      units: count,
      thousandths: 0,
      amount: rows.reduce((sum, row) => sum + row.amount, 0),
    },
  };
}
