import type { PaymentMethod } from "./payment.js";

export interface RefundablePayment {
  id: string;
  method: PaymentMethod;
  provider: string;
  amount: number;
  state: string;
}

export interface PlannedRefund {
  paymentId: string;
  method: PaymentMethod;
  provider: string;
  amount: number;
  state: "APPROVED" | "PENDING";
}

export function plannedRefunds(payments: readonly RefundablePayment[]): PlannedRefund[] {
  return payments
    .filter((payment) => payment.state === "APPROVED")
    .map((payment) => ({
      paymentId: payment.id,
      method: payment.method,
      provider: payment.provider,
      amount: payment.amount,
      state: payment.method === "CASH" ? "APPROVED" : "PENDING",
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
      const matching = refunds.filter((refund) => refund.paymentId === expected.paymentId);
      const [refund] = matching;
      return (
        matching.length === 1 &&
        refund?.amount === expected.amount &&
        refund.method === expected.method &&
        refund.provider === expected.provider &&
        (expected.method === "CASH" ? refund.state === "APPROVED" : isRefundSettled(refund.state))
      );
    })
  );
}

function isRefundSettled(state: string): boolean {
  return state === "PENDING" || state === "APPROVED";
}
