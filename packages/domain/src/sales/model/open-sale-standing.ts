import {
  type ApprovedPayment,
  aMercadoPagoChargeInProgress,
  approvedPayments,
  cancellableWithoutAuthorization,
  hasApprovedPayment,
  type MercadoPagoChargeInProgress,
  mercadoPagoChargeInProgress,
  type PendingMercadoPagoCharge,
  type PendingMercadoPagoChargeWait,
  type PlannedRefund,
  type PointCardType,
  plannedRefunds,
  type RefundablePayment,
  type SaleBalance,
  saleBalance,
} from "../../payments/index.js";

export type SaleLinesLock = "approved_payment" | "mercado_pago_charge_in_progress";

export type SaleCancelRefusal = "mercado_pago_charge_in_progress";

export interface OpenSaleStanding {
  balance: SaleBalance;
  approvedPayments: ApprovedPayment[];
  linesLock: SaleLinesLock | null;
  cancellable: boolean;
  cancelRefusal: SaleCancelRefusal | null;
  refundsOnCancel: PlannedRefund[];
  mercadoPagoChargeInProgress: MercadoPagoChargeInProgress | null;
}

export function saleLinesLock(
  payments: readonly { state: string }[],
  pendingMercadoPagoPayments: readonly PendingMercadoPagoChargeWait[],
  now: Date,
): SaleLinesLock | null {
  if (hasApprovedPayment(payments)) {
    return "approved_payment";
  }
  return aMercadoPagoChargeInProgress(pendingMercadoPagoPayments, now)
    ? "mercado_pago_charge_in_progress"
    : null;
}

export function saleCancelRefusal(
  pendingMercadoPagoPayments: readonly PendingMercadoPagoChargeWait[],
  now: Date,
): SaleCancelRefusal | null {
  return aMercadoPagoChargeInProgress(pendingMercadoPagoPayments, now)
    ? "mercado_pago_charge_in_progress"
    : null;
}

export function openSaleStanding(
  total: number,
  payments: readonly (RefundablePayment & { cardType?: PointCardType | null })[],
  pendingMercadoPagoPayments: readonly PendingMercadoPagoCharge[],
  now: Date,
): OpenSaleStanding {
  const cancelRefusal = saleCancelRefusal(pendingMercadoPagoPayments, now);
  return {
    balance: saleBalance(total, payments),
    approvedPayments: approvedPayments(payments),
    linesLock: saleLinesLock(payments, pendingMercadoPagoPayments, now),
    cancellable: cancelRefusal === null && cancellableWithoutAuthorization(payments),
    cancelRefusal,
    refundsOnCancel: cancelRefusal === null ? plannedRefunds(payments) : [],
    mercadoPagoChargeInProgress: mercadoPagoChargeInProgress(pendingMercadoPagoPayments, now),
  };
}
