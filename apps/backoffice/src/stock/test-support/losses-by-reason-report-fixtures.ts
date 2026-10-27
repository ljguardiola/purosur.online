import type { LossesByReasonReportBody } from "@purosur/contracts";

type ReasonLosses = LossesByReasonReportBody["reasons"][number];

export const spoiledReason: ReasonLosses = {
  reason: "spoiled",
  loss_count: 3,
  products: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Queso cremoso",
      sale_unit: "KG",
      quantity: 2_500,
      loss_count: 2,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Pan lactal",
      sale_unit: "UNIT",
      quantity: 3_000,
      loss_count: 1,
    },
  ],
};

export const expiredReason: ReasonLosses = {
  reason: "expired",
  loss_count: 1,
  products: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Yogur natural",
      sale_unit: "UNIT",
      quantity: 6_000,
      loss_count: 1,
    },
  ],
};

export const returnDiscardReason: ReasonLosses = {
  reason: "return_discard",
  loss_count: 1,
  products: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Queso cremoso",
      sale_unit: "KG",
      quantity: 400,
      loss_count: 1,
    },
  ],
};

export function lossesByReasonReport(
  reasons: ReasonLosses[] = [spoiledReason, expiredReason],
  range: LossesByReasonReportBody["range"] = { from: "2026-10-01", to: "2026-10-31" },
): LossesByReasonReportBody {
  return { range, reasons };
}
