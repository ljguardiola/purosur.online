import type { ExpiringLotsReportBody } from "@purosur/contracts";

type Lot = ExpiringLotsReportBody["lots"][number];

export const cheeseLot: Lot = {
  id: "lot-1",
  lot_number: "L-2312",
  expires_on: "2026-10-16",
  remaining: 4_300,
  value_cents: 4_377_400,
  expired: false,
  days_to_expiry: 3,
  product: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Queso cremoso",
    category_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
    category_name: "Lácteos",
    sale_unit: "KG",
  },
};

export const breadLot: Lot = {
  id: "lot-2",
  lot_number: null,
  expires_on: "2026-10-30",
  remaining: 12_000,
  value_cents: null,
  expired: false,
  days_to_expiry: 17,
  product: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Pan lactal",
    category_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77",
    category_name: "Panificados",
    sale_unit: "UNIT",
  },
};

export const expiredYogurtLot: Lot = {
  id: "lot-3",
  lot_number: "L-0901",
  expires_on: "2026-10-10",
  remaining: 6_000,
  value_cents: 900_000,
  expired: true,
  days_to_expiry: -3,
  product: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Yogur natural",
    category_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
    category_name: "Lácteos",
    sale_unit: "UNIT",
  },
};

export function expiringLotsReport(
  lots: Lot[] = [cheeseLot, breadLot],
  overrides: Partial<Pick<ExpiringLotsReportBody, "period" | "window_days">> = {},
): ExpiringLotsReportBody {
  const valued = lots.map(({ value_cents }) => value_cents);
  return {
    period: overrides.period ?? { from: "2026-10-13", to: "2026-11-12" },
    window_days: overrides.window_days ?? 30,
    lots,
    summary: {
      lot_count: lots.length,
      value_cents: valued.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      without_cost_count: valued.filter((value) => value === null).length,
    },
  };
}
