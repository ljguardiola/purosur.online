import type { FindSaleForReturnOutcome } from "@purosur/contracts";

export type SaleForReturn = Extract<FindSaleForReturnOutcome, { kind: "found" }>["sale"];
export type SaleLineForReturn = SaleForReturn["lines"][number];
export type PaymentForReturn = SaleForReturn["payments"][number];
