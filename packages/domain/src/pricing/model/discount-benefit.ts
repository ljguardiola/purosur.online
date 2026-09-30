export type DiscountBenefit =
  | { kind: "PERCENT_OFF"; percent: number }
  | { kind: "BUY_N_PAY_M"; buyQty: number; payQty: number };
