import {
  aQrChargeInItsWait,
  cancellableWithoutAuthorization,
  hasApprovedPayment,
  holdsApprovedQrPayment,
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

export function saleLinesLockedBy(
  payments: readonly { state: string }[],
  pendingQrPayments: readonly { waitEndsAt: Date }[],
  now: Date,
): boolean {
  return hasApprovedPayment(payments) || aQrChargeInItsWait(pendingQrPayments, now);
}

export function openSaleStanding(
  total: number,
  payments: readonly RefundablePayment[],
  pendingQrPayments: readonly { waitEndsAt: Date }[],
  now: Date,
): OpenSaleStanding {
  const qrChargeInItsWait = aQrChargeInItsWait(pendingQrPayments, now);
  return {
    balance: saleBalance(total, payments),
    linesEditable: !saleLinesLockedBy(payments, pendingQrPayments, now),
    cancellable: !qrChargeInItsWait && cancellableWithoutAuthorization(payments),
    refundsOnCancel:
      qrChargeInItsWait || holdsApprovedQrPayment(payments) ? [] : plannedRefunds(payments),
  };
}
