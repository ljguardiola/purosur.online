import { cancellableWithoutAuthorization, hasApprovedPayment } from "./payment.js";
import { type SaleBalance, saleBalance } from "./sale-balance.js";

export interface OpenSaleStanding {
  balance: SaleBalance;
  linesEditable: boolean;
  cancellable: boolean;
}

export function openSaleStanding(
  total: number,
  payments: readonly { amount: number; state: string }[],
): OpenSaleStanding {
  return {
    balance: saleBalance(total, payments),
    linesEditable: !hasApprovedPayment(payments),
    cancellable: cancellableWithoutAuthorization(payments),
  };
}
