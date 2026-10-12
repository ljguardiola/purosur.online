import {
  aMercadoPagoChargeInProgress,
  cancellableWithoutAuthorization,
  hasApprovedPayment,
  holdsApprovedMercadoPagoPayment,
  type MercadoPagoChargeInProgress,
  type MercadoPagoPaymentMethod,
  mercadoPagoChargeInProgress,
  type PlannedRefund,
  plannedRefunds,
  type RefundablePayment,
  type SaleBalance,
  saleBalance,
} from "../../payments/index.js";

export type SaleLinesLock = "approved_payment" | "mercado_pago_charge_in_progress";

export type SaleCancelRefusal = "mercado_pago_charge_in_progress" | "holds_mercado_pago_payment";

export interface OpenSaleStanding {
  balance: SaleBalance;
  linesLock: SaleLinesLock | null;
  cancellable: boolean;
  cancelRefusal: SaleCancelRefusal | null;
  refundsOnCancel: PlannedRefund[];
  mercadoPagoChargeInProgress: MercadoPagoChargeInProgress | null;
}

export function saleLinesLock(
  payments: readonly { state: string }[],
  pendingMercadoPagoPayments: readonly { method: string; waitEndsAt: Date }[],
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
  payments: readonly { state: string; method: string }[],
  pendingMercadoPagoPayments: readonly { method: string; waitEndsAt: Date }[],
  now: Date,
): SaleCancelRefusal | null {
  if (aMercadoPagoChargeInProgress(pendingMercadoPagoPayments, now)) {
    return "mercado_pago_charge_in_progress";
  }
  return holdsApprovedMercadoPagoPayment(payments) ? "holds_mercado_pago_payment" : null;
}

export function openSaleStanding(
  total: number,
  payments: readonly RefundablePayment[],
  pendingMercadoPagoPayments: readonly {
    id: string;
    method: MercadoPagoPaymentMethod;
    amount: number;
    waitEndsAt: Date;
  }[],
  now: Date,
): OpenSaleStanding {
  const cancelRefusal = saleCancelRefusal(payments, pendingMercadoPagoPayments, now);
  return {
    balance: saleBalance(total, payments),
    linesLock: saleLinesLock(payments, pendingMercadoPagoPayments, now),
    cancellable: cancelRefusal === null && cancellableWithoutAuthorization(payments),
    cancelRefusal,
    refundsOnCancel: cancelRefusal === null ? plannedRefunds(payments) : [],
    mercadoPagoChargeInProgress: mercadoPagoChargeInProgress(pendingMercadoPagoPayments, now),
  };
}
