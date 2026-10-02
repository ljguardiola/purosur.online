import { cancellableWithoutAuthorization } from "./payment.js";
import type { SaleLine } from "./sale.js";
import { saleTotal } from "./sale-line.js";

export interface OpenSaleSummary {
  total: number;
  cancellable: boolean;
}

export function openSaleSummary(sale: {
  lines: readonly Pick<SaleLine, "lineTotal">[];
  payments: readonly { state: string }[];
}): OpenSaleSummary {
  return {
    total: saleTotal(sale.lines),
    cancellable: cancellableWithoutAuthorization(sale.payments),
  };
}
