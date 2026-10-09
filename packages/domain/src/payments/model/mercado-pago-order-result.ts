import type { PaymentTransactionState } from "./payment-transaction.js";

interface MercadoPagoOrderPayment {
  status: string;
  statusDetail: string;
  paidAmount: number | null;
}

export interface MercadoPagoOrderResult {
  status: string;
  statusDetail: string;
  totalAmount: number;
  totalPaidAmount: number | null;
  payments: readonly MercadoPagoOrderPayment[];
}

export interface PaymentStateAssessment {
  state: PaymentTransactionState;
  needsReview: boolean;
}

const ACCREDITED = "accredited";
const PROCESSED = "processed";
const PAID_ORDER_DETAILS: readonly string[] = [ACCREDITED, PROCESSED];

function amountPaid(result: MercadoPagoOrderResult): number | null {
  if (result.totalPaidAmount !== null) {
    return result.totalPaidAmount;
  }
  let sum = 0;
  for (const { paidAmount } of result.payments) {
    if (paidAmount === null) {
      return null;
    }
    sum += paidAmount;
  }
  return sum;
}

function isFullyAccredited(result: MercadoPagoOrderResult): boolean {
  return (
    PAID_ORDER_DETAILS.includes(result.statusDetail) &&
    result.payments.length > 0 &&
    result.payments.every(
      (payment) => payment.status === PROCESSED && payment.statusDetail === ACCREDITED,
    )
  );
}

export function paymentStateOfMercadoPagoOrder(
  result: MercadoPagoOrderResult,
  orderAmount: number,
): PaymentStateAssessment {
  switch (result.status) {
    case PROCESSED:
      return isFullyAccredited(result) && amountPaid(result) === orderAmount
        ? { state: "APPROVED", needsReview: false }
        : { state: "PENDING", needsReview: true };
    case "refunded":
      return { state: "PENDING", needsReview: true };
    case "canceled":
      return { state: "CANCELLED", needsReview: false };
    case "expired":
      return { state: "EXPIRED", needsReview: false };
    case "failed":
      return { state: "DECLINED", needsReview: false };
    default:
      return { state: "PENDING", needsReview: false };
  }
}

export function applyMercadoPagoOrderResult(
  transaction: PaymentStateAssessment & { amount: number },
  result: MercadoPagoOrderResult,
): PaymentStateAssessment {
  if (transaction.state !== "PENDING") {
    return { state: transaction.state, needsReview: transaction.needsReview };
  }
  return paymentStateOfMercadoPagoOrder(result, transaction.amount);
}
