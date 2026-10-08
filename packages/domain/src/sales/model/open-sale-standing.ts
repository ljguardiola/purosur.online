import {
  cancellableWithoutAuthorization,
  hasApprovedPayment,
  type PlannedRefund,
  plannedRefunds,
  type RefundablePayment,
  type SaleBalance,
  saleBalance,
} from "../../payments/index.js";

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
