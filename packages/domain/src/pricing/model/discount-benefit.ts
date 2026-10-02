export type DiscountBenefit =
  | { kind: "PERCENT_OFF"; percent: number }
  | { kind: "BUY_N_PAY_M"; buyQty: number; payQty: number };

export const DISCOUNT_BENEFIT_KINDS = [
  "PERCENT_OFF",
  "BUY_N_PAY_M",
] as const satisfies readonly DiscountBenefit["kind"][];
