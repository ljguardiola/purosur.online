import { cancellableWithoutAuthorization, hasApprovedPayment } from "./payment.js";
import { type PlannedRefund, plannedRefunds, type RefundablePayment } from "./payment-refund.js";
import { type SaleBalance, saleBalance } from "./sale-balance.js";

export interface OpenSaleStanding {
  balance: SaleBalance;
  linesEditable: boolean;
  cancellable: boolean;
  refundsOnCancel: PlannedRefund[];
}

export function openSaleStanding(
  total: number,
  payments: readonly RefundablePayment[],
): OpenSaleStanding {
  return {
    balance: saleBalance(total, payments),
    linesEditable: !hasApprovedPayment(payments),
    cancellable: cancellableWithoutAuthorization(payments),
    refundsOnCancel: plannedRefunds(payments),
  };
}
