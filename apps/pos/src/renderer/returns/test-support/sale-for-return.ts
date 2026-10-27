import type { PaymentForReturn, SaleForReturn, SaleLineForReturn } from "../return-sale";

export const PASTA: SaleLineForReturn = {
  id: "line-pasta",
  product_id: "product-pasta",
  product_name: "Pasta de maní 380 g",
  sale_unit: "UNIT",
  sold_quantity: 3,
  returned_quantity: 0,
  returnable_quantity: 3,
  charged_amount: 970_000,
  refunded_amount: 0,
  must_be_returned_whole: false,
};

export const NIBS: SaleLineForReturn = {
  id: "line-nibs",
  product_id: "product-nibs",
  product_name: "Nibs de cacao",
  sale_unit: "KG",
  sold_quantity: 350,
  returned_quantity: 0,
  returnable_quantity: 350,
  charged_amount: 423_500,
  refunded_amount: 0,
  must_be_returned_whole: false,
};

export const HONEY: SaleLineForReturn = {
  id: "line-honey",
  product_id: "product-honey",
  product_name: "Miel pura de abeja 1 kg",
  sale_unit: "UNIT",
  sold_quantity: 2,
  returned_quantity: 0,
  returnable_quantity: 2,
  charged_amount: 840_000,
  refunded_amount: 0,
  must_be_returned_whole: true,
};

export const TEA: SaleLineForReturn = {
  id: "line-tea",
  product_id: "product-tea",
  product_name: "Té verde en hebras 100 g",
  sale_unit: "UNIT",
  sold_quantity: 2,
  returned_quantity: 2,
  returnable_quantity: 0,
  charged_amount: 300_000,
  refunded_amount: 300_000,
  must_be_returned_whole: false,
};

export const CASH: PaymentForReturn = {
  payment_id: "pay-cash",
  method: "CASH",
  amount: 1_500_000,
  refunded_amount: 0,
  remaining: 1_500_000,
  eligible: true,
  ineligible_reason: null,
};

export const TRANSFER: PaymentForReturn = {
  payment_id: "pay-transfer",
  method: "TRANSFER",
  amount: 1_033_500,
  refunded_amount: 0,
  remaining: 1_033_500,
  eligible: false,
  ineligible_reason: "not_cash",
};

export const SALE: SaleForReturn = {
  sale_id: "sale-1",
  occurred_at: "2026-09-12T11:42:00.000-03:00",
  total: 2_533_500,
  invoice: { point_of_sale: 3, number: 1192 },
  windows: {
    change_of_mind: { last_allowed_day: "2026-09-27", open: true },
    defective: { last_allowed_day: "2027-03-12", open: true },
  },
  lines: [PASTA, NIBS, HONEY, TEA],
  payments: [CASH, TRANSFER],
};
