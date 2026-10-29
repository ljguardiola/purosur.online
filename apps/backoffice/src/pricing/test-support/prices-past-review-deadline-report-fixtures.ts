import type { PricesPastReviewDeadlineReportBody } from "@purosur/contracts";

type Price = PricesPastReviewDeadlineReportBody["prices"][number];

export const neverReviewedOil: Price = {
  product: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Aceite de Almendras",
    brand_name: "Vitora",
    net_content: { quantity: 30, unit: "ML" },
    category_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77",
    category_name: "Almacén",
    sale_unit: "UNIT",
  },
  current_price: null,
  last_reviewed_at: null,
  past_deadline_on: null,
  reason: "never_reviewed",
};

export const overdueCheese: Price = {
  product: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Queso cremoso",
    brand_name: null,
    net_content: null,
    category_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
    category_name: "Lácteos",
    sale_unit: "KG",
  },
  current_price: { unit_price_cents: 1_250_000, valid_from: "2026-08-01T13:00:00.000Z" },
  last_reviewed_at: "2026-08-01T13:00:00.000Z",
  past_deadline_on: "2026-08-31",
  reason: "overdue",
};

export const postponedBread: Price = {
  product: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Pan lactal",
    brand_name: null,
    net_content: null,
    category_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77",
    category_name: "Panificados",
    sale_unit: "UNIT",
  },
  current_price: { unit_price_cents: 320_000, valid_from: "2026-09-10T15:30:00.000Z" },
  last_reviewed_at: "2026-09-10T15:30:00.000Z",
  past_deadline_on: "2026-10-10",
  reason: "postponed",
};

export function pricesPastReviewDeadlineReport(
  prices: Price[] = [neverReviewedOil, overdueCheese],
  overrides: Partial<Pick<PricesPastReviewDeadlineReportBody, "period" | "window_days">> = {},
): PricesPastReviewDeadlineReportBody {
  return {
    period: overrides.period ?? { from: "2026-08-31", to: "2026-10-13" },
    window_days: overrides.window_days ?? 30,
    prices,
    summary: { price_count: prices.length },
  };
}
