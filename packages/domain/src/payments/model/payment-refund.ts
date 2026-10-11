import type { PaymentMethod } from "./payment.js";
import type { MercadoPagoQrPaymentTransaction } from "./payment-transaction.js";

export interface RefundablePayment {
  id: string;
  method: PaymentMethod;
  provider: string;
  amount: number;
  state: string;
}

export const REFUND_DONE_STATE = "APPROVED";
export const REFUND_PENDING_STATE = "PENDING";
export const REFUND_DISCARDED_STATE = "DISCARDED";
export const REFUND_STATES = [
  REFUND_DONE_STATE,
  REFUND_PENDING_STATE,
  REFUND_DISCARDED_STATE,
] as const;
export type RefundState = (typeof REFUND_STATES)[number];

export const SALE_CANCELLED_REFUND_ORIGIN = "sale_cancelled";
export const LATE_PAYMENT_REFUND_ORIGIN = "late_payment";
export const REFUND_ORIGINS = [SALE_CANCELLED_REFUND_ORIGIN, LATE_PAYMENT_REFUND_ORIGIN] as const;
export type RefundOrigin = (typeof REFUND_ORIGINS)[number];

export type PlannedRefundState = typeof REFUND_DONE_STATE | typeof REFUND_PENDING_STATE;

export interface PlannedRefund {
  paymentId: string;
  method: PaymentMethod;
  provider: string;
  amount: number;
  state: PlannedRefundState;
}

export function plannedRefunds(payments: readonly RefundablePayment[]): PlannedRefund[] {
  return payments
    .filter((payment) => payment.state === "APPROVED")
    .map((payment) => ({
      paymentId: payment.id,
      method: payment.method,
      provider: payment.provider,
      amount: payment.amount,
      state: payment.method === "CASH" ? REFUND_DONE_STATE : REFUND_PENDING_STATE,
    }));
}

export function refundsSettleApprovedPayments(
  payments: readonly RefundablePayment[],
  refunds: readonly (Omit<PlannedRefund, "state"> & { state: string })[],
): boolean {
  const planned = plannedRefunds(payments);
  return (
    refunds.length === planned.length &&
    planned.every((expected) => {
      const refund = refunds.find((candidate) => candidate.paymentId === expected.paymentId);
      return (
        refund?.amount === expected.amount &&
        refund.method === expected.method &&
        refund.provider === expected.provider &&
        (expected.method === "CASH"
          ? refund.state === REFUND_DONE_STATE
          : isRefundSettled(refund.state))
      );
    })
  );
}

function isRefundSettled(state: string): boolean {
  return isRefundPending(state) || state === REFUND_DONE_STATE;
}

export function isRefundPending(state: string): boolean {
  return state === REFUND_PENDING_STATE;
}

export function isRefundDiscarded(state: string): boolean {
  return state === REFUND_DISCARDED_STATE;
}

export function isRefundDiscardable(origin: string): boolean {
  return origin === LATE_PAYMENT_REFUND_ORIGIN;
}

export interface LatePaymentRefund extends PlannedRefund {
  origin: typeof LATE_PAYMENT_REFUND_ORIGIN;
}

export function latePaymentRefund(
  payment: Pick<MercadoPagoQrPaymentTransaction, "id" | "method" | "provider" | "amount">,
): LatePaymentRefund {
  return {
    paymentId: payment.id,
    method: payment.method,
    provider: payment.provider,
    amount: payment.amount,
    state: REFUND_PENDING_STATE,
    origin: LATE_PAYMENT_REFUND_ORIGIN,
  };
}
