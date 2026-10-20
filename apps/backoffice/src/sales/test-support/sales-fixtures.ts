import type {
  AverageTicketBody,
  SalesByCashierBody,
  SalesByProductAndCategoryBody,
  SalesByPromotionBody,
  SalesReportBody,
} from "@purosur/contracts";

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

const ANA_ID = "11111111-1111-4111-8111-111111111111";
const BETO_ID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_CASHIER_ID = "33333333-3333-4333-8333-333333333333";

export const cashierSalesReport: SalesByCashierBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  rows: [
    {
      cashier_id: ANA_ID,
      name: "Ana",
      sessions: 1,
      sales_count: 40,
      total: 800_000,
      average_ticket: 20_000,
    },
    {
      cashier_id: BETO_ID,
      name: "Beto",
      sessions: 4,
      sales_count: 25,
      total: 875_000,
      average_ticket: 35_000,
    },
    {
      cashier_id: UNKNOWN_CASHIER_ID,
      name: null,
      sessions: 2,
      sales_count: 5,
      total: 75_000,
      average_ticket: 15_000,
    },
  ],
  totals: { cashiers: 3, sales_count: 70, total: 1_750_000, average_ticket: 25_000 },
};

export const singleSaleCashierReport: SalesByCashierBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  rows: [
    {
      cashier_id: ANA_ID,
      name: "Ana",
      sessions: 1,
      sales_count: 1,
      total: 4_800,
      average_ticket: 4_800,
    },
  ],
  totals: { cashiers: 1, sales_count: 1, total: 4_800, average_ticket: 4_800 },
};

export const noCashierSalesReport: SalesByCashierBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  rows: [],
  totals: { cashiers: 0, sales_count: 0, total: 0, average_ticket: null },
};

const FINDE_ID = "44444444-4444-4444-8444-444444444444";
const BUNDLE_ID = "55555555-5555-4555-8555-555555555555";
const REMOVED_PROMOTION_ID = "66666666-6666-4666-8666-666666666666";

export const promotionDiscountsReport: SalesByPromotionBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  rows: [
    {
      promotion_id: FINDE_ID,
      name: "Finde de yerbas",
      terms: {
        benefit: { kind: "PERCENT_OFF", percent: 15 },
        target: { kind: "CATEGORY", name: "Almacén › Yerbas" },
        weekdays: [6, 7],
      },
      lines: 30,
      units: 45,
      thousandths: 0,
      discounted: 120_000,
    },
    {
      promotion_id: BUNDLE_ID,
      name: "Tres por dos",
      terms: {
        benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
        target: { kind: "PRODUCT", name: "Azúcar 1 kg" },
        weekdays: [],
      },
      lines: 50,
      units: 150,
      thousandths: 2_500,
      discounted: 90_000,
    },
    {
      promotion_id: REMOVED_PROMOTION_ID,
      name: null,
      terms: null,
      lines: 4,
      units: 0,
      thousandths: 1_250,
      discounted: 3_000,
    },
  ],
  totals: {
    discounted: 213_000,
    lines: 84,
    most_used: { promotion_id: BUNDLE_ID, name: "Tres por dos", lines: 50 },
  },
};

export const singleLinePromotionReport: SalesByPromotionBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  rows: [
    {
      promotion_id: FINDE_ID,
      name: "Finde de yerbas",
      terms: {
        benefit: { kind: "PERCENT_OFF", percent: 15 },
        target: { kind: "CATEGORY", name: "Almacén › Yerbas" },
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      },
      lines: 1,
      units: 1,
      thousandths: 0,
      discounted: 450,
    },
  ],
  totals: {
    discounted: 450,
    lines: 1,
    most_used: { promotion_id: FINDE_ID, name: "Finde de yerbas", lines: 1 },
  },
};

export const noPromotionDiscountsReport: SalesByPromotionBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  rows: [],
  totals: { discounted: 0, lines: 0, most_used: null },
};

export const averageTicketReport: AverageTicketBody = {
  range: { from: "2026-09-24", to: "2026-10-14" },
  previous_range: { from: "2026-09-03", to: "2026-09-23" },
  current: { sales_count: 70, total: 1_750_000, average_ticket: 25_000 },
  previous: { sales_count: 55, total: 1_320_000, average_ticket: 24_000 },
  change_tenths: 42,
  weeks: [
    {
      from: "2026-10-08",
      to: "2026-10-14",
      sales_count: 40,
      total: 1_100_000,
      average_ticket: 27_500,
    },
    {
      from: "2026-10-01",
      to: "2026-10-07",
      sales_count: 10,
      total: 500_000,
      average_ticket: 50_000,
    },
    {
      from: "2026-09-24",
      to: "2026-09-30",
      sales_count: 20,
      total: 150_000,
      average_ticket: 7_500,
    },
  ],
};

export const singleDayAverageTicketReport: AverageTicketBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  previous_range: { from: "2026-10-06", to: "2026-10-06" },
  current: { sales_count: 1, total: 4_800, average_ticket: 4_800 },
  previous: { sales_count: 0, total: 0, average_ticket: null },
  change_tenths: null,
  weeks: [
    { from: "2026-10-07", to: "2026-10-07", sales_count: 1, total: 4_800, average_ticket: 4_800 },
  ],
};

export const unchangedAverageTicketReport: AverageTicketBody = {
  ...averageTicketReport,
  change_tenths: 0,
};

export const quietWeekAverageTicketReport: AverageTicketBody = {
  ...averageTicketReport,
  weeks: [
    ...averageTicketReport.weeks.slice(0, 2),
    { from: "2026-09-24", to: "2026-09-30", sales_count: 0, total: 0, average_ticket: null },
  ],
};

export const noSalesAverageTicketReport: AverageTicketBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  previous_range: { from: "2026-10-06", to: "2026-10-06" },
  current: { sales_count: 0, total: 0, average_ticket: null },
  previous: { sales_count: 0, total: 0, average_ticket: null },
  change_tenths: null,
  weeks: [],
};

export const noPreviousAverageTicketReport: AverageTicketBody = {
  range: { from: "0001-01-01", to: "0001-01-07" },
  previous_range: null,
  current: { sales_count: 1, total: 4_800, average_ticket: 4_800 },
  previous: null,
  change_tenths: null,
  weeks: [
    { from: "0001-01-01", to: "0001-01-07", sales_count: 1, total: 4_800, average_ticket: 4_800 },
  ],
};
