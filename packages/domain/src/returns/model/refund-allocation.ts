import {
  APPROVED_PAYMENT_STATE,
  exceedsRefundable,
  type PaymentMethod,
  type PointCardType,
  refundableAmount,
} from "../../payments/index.js";

export interface ReturnablePayment {
  id: string;
  method: PaymentMethod;
  provider: string;
  amount: number;
  state: string;
  refundedAmount: number;
  cardType: PointCardType | null;
}

export type PaymentIneligibleReason = "nothing_left";

export interface PaymentRefundability {
  paymentId: string;
  method: PaymentMethod;
  amount: number;
  refundedAmount: number;
  cardType: PointCardType | null;
  remaining: number;
  eligible: boolean;
  ineligibleReason: PaymentIneligibleReason | null;
}

export interface RefundAllocation {
  paymentId: string;
  amount: number;
}

export type RefundAllocationRefusal =
  | { kind: "unknown_payment"; paymentId: string }
  | { kind: "invalid_amount"; paymentId: string }
  | { kind: "exceeds_payment"; paymentId: string; remaining: number }
  | { kind: "total_mismatch"; refundableTotal: number; imputed: number };

function approved(payments: readonly ReturnablePayment[]): ReturnablePayment[] {
  return payments.filter(({ state }) => state === APPROVED_PAYMENT_STATE);
}

function ineligibleReasonOf(payment: ReturnablePayment): PaymentIneligibleReason | null {
  return refundableAmount(payment.amount, payment.refundedAmount) === 0 ? "nothing_left" : null;
}

export function returnablePayments(payments: readonly ReturnablePayment[]): PaymentRefundability[] {
  return approved(payments).map((payment) => {
    const ineligibleReason = ineligibleReasonOf(payment);
    return {
      paymentId: payment.id,
      method: payment.method,
      amount: payment.amount,
      refundedAmount: payment.refundedAmount,
      cardType: payment.cardType,
      remaining: refundableAmount(payment.amount, payment.refundedAmount),
      eligible: ineligibleReason === null,
      ineligibleReason,
    };
  });
}

export function refundAllocationRefusal(
  payments: readonly ReturnablePayment[],
  allocations: readonly RefundAllocation[],
  refundableTotal: number,
): RefundAllocationRefusal | null {
  const candidates = new Map(approved(payments).map((payment) => [payment.id, payment]));
  const unknown = allocations.find(({ paymentId }) => !candidates.has(paymentId));
  if (unknown !== undefined) {
    return { kind: "unknown_payment", paymentId: unknown.paymentId };
  }
  const invalid = allocations.find(({ amount }) => !Number.isSafeInteger(amount) || amount <= 0);
  if (invalid !== undefined) {
    return { kind: "invalid_amount", paymentId: invalid.paymentId };
  }
  const imputedTo = new Map<string, number>();
  for (const { paymentId, amount } of allocations) {
    imputedTo.set(paymentId, (imputedTo.get(paymentId) ?? 0) + amount);
  }
  for (const payment of candidates.values()) {
    if (exceedsRefundable(imputedTo.get(payment.id) ?? 0, payment.amount, payment.refundedAmount)) {
      return {
        kind: "exceeds_payment",
        paymentId: payment.id,
        remaining: refundableAmount(payment.amount, payment.refundedAmount),
      };
    }
  }
  const imputed = allocations.reduce((sum, { amount }) => sum + amount, 0);
  return imputed === refundableTotal ? null : { kind: "total_mismatch", refundableTotal, imputed };
}
