import type { OpenSale } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { isChargeable, paidOrderToApplyOf } from "./sale-charge";

const SALE: OpenSale = {
  id: "sale-1",
  lines: [
    {
      id: "line-1",
      product_id: "yerba",
      product_name: "Yerba mate 1 kg",
      sale_unit: "UNIT",
      weight_source: null,
      quantity: 1,
      list_unit_price: 626_000,
      discount_amount: 0,
      promotion: null,
      manual_adjustment: null,
      line_total: 626_000,
    },
  ],
  total: 626_000,
  paid: 0,
  pending: 626_000,
  payments: [],
  lines_lock: null,
  cancel_refusal: null,
  charge_refusal: null,
  rebuilt_paid_order: null,
  mercado_pago_charge_in_progress: null,
  refunds_on_cancel: [],
  refund_now_on_cancel: 0,
  cancel_authorization_required: false,
  adjust_authorization_required: false,
  sale_discount_authorization_required: false,
  sale_discount_refusal: null,
  sale_discount: null,
  gross_subtotal: 626_000,
  subtotal: 626_000,
  promotion_savings: 0,
};

const PAID_ORDER: NonNullable<OpenSale["rebuilt_paid_order"]> = {
  payment_transaction_id: "payment-1",
  method: "QR",
  amount: 626_000,
  applied: false,
};

describe("paidOrderToApplyOf", () => {
  it("is the sale's rebuilt paid order while it is not applied", () => {
    expect(paidOrderToApplyOf({ ...SALE, rebuilt_paid_order: PAID_ORDER })).toBe(PAID_ORDER);
  });

  it("is none once the paid order is applied, or without one or a sale", () => {
    expect(
      paidOrderToApplyOf({
        ...SALE,
        rebuilt_paid_order: { ...PAID_ORDER, applied: true },
      }),
    ).toBeNull();
    expect(paidOrderToApplyOf(SALE)).toBeNull();
    expect(paidOrderToApplyOf(null)).toBeNull();
  });
});

describe("isChargeable", () => {
  it("is a sale with lines and a total to charge", () => {
    expect(isChargeable(SALE)).toBe(true);
  });

  it.each<[string, OpenSale | null]>([
    ["no sale", null],
    ["a sale without lines", { ...SALE, lines: [] }],
    ["a sale whose total is zero", { ...SALE, total: 0 }],
    [
      "a sale the core refuses to charge",
      {
        ...SALE,
        charge_refusal: { kind: "no_buyer_identification_threshold" },
      },
    ],
    ["a sale with a paid order to apply", { ...SALE, rebuilt_paid_order: PAID_ORDER }],
  ])("is not %s", (_, sale) => {
    expect(isChargeable(sale)).toBe(false);
  });
});
