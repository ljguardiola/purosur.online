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

export type SaleLinesLock = "approved_payment" | "qr_charge_in_progress";

export type SaleCancelRefusal = "qr_charge_in_progress" | "holds_qr_payment";

export interface OpenSaleStanding {
  balance: SaleBalance;
  linesLock: SaleLinesLock | null;
  cancellable: boolean;
  cancelRefusal: SaleCancelRefusal | null;
  refundsOnCancel: PlannedRefund[];
}

export function saleLinesLock(
  payments: readonly { state: string }[],
  pendingQrPayments: readonly { waitEndsAt: Date }[],
  now: Date,
): SaleLinesLock | null {
  if (hasApprovedPayment(payments)) {
    return "approved_payment";
  }
  return aQrChargeInItsWait(pendingQrPayments, now) ? "qr_charge_in_progress" : null;
}

export function saleCancelRefusal(
  payments: readonly { state: string; method: string }[],
  pendingQrPayments: readonly { waitEndsAt: Date }[],
  now: Date,
): SaleCancelRefusal | null {
  if (aQrChargeInItsWait(pendingQrPayments, now)) {
    return "qr_charge_in_progress";
  }
  return holdsApprovedQrPayment(payments) ? "holds_qr_payment" : null;
}

export function openSaleStanding(
  total: number,
  payments: readonly RefundablePayment[],
  pendingQrPayments: readonly { waitEndsAt: Date }[],
  now: Date,
): OpenSaleStanding {
  const cancelRefusal = saleCancelRefusal(payments, pendingQrPayments, now);
  return {
    balance: saleBalance(total, payments),
    linesLock: saleLinesLock(payments, pendingQrPayments, now),
    cancellable: cancelRefusal === null && cancellableWithoutAuthorization(payments),
    cancelRefusal,
    refundsOnCancel: cancelRefusal === null ? plannedRefunds(payments) : [],
  };
}
