import type {
  MercadoPagoPointPaymentTransaction,
  MercadoPagoQrPaymentTransaction,
} from "./payment-transaction.js";

export type RebuiltSaleState = "OPEN" | "COMPLETED" | "CANCELLED";

export interface SaleRebuiltAgainstPaidOrder {
  state: RebuiltSaleState;
  paymentApplied: boolean;
}

export function rebuiltPaidOrderAppliedAmount(paidAmount: number, saleTotal: number): number {
  return Math.min(paidAmount, saleTotal);
}

export function rebuiltPaidOrderSurplus(paidAmount: number, saleTotal: number): number {
  return paidAmount - rebuiltPaidOrderAppliedAmount(paidAmount, saleTotal);
}

export function paidOrderAwaitsApplication(
  paidOrder: { paymentTransactionId: string } | undefined,
  salePayments: readonly { id: string }[],
): boolean {
  return (
    paidOrder !== undefined &&
    !salePayments.some((payment) => payment.id === paidOrder.paymentTransactionId)
  );
}

export function rebuiltPaidOrderStanding(
  paidOrder: { paymentTransactionId: string; amount: number; method: "QR" | "POINT" } | undefined,
  salePayments: readonly { id: string }[],
): {
  paymentTransactionId: string;
  amount: number;
  method: "QR" | "POINT";
  applied: boolean;
} | null {
  if (paidOrder === undefined) {
    return null;
  }
  const { paymentTransactionId, amount, method } = paidOrder;
  return {
    paymentTransactionId,
    amount,
    method,
    applied: !paidOrderAwaitsApplication(paidOrder, salePayments),
  };
}

export function paidOrderWithoutSaleIsResolved({
  convertedIntoRefund,
  rebuiltSales,
}: {
  convertedIntoRefund: boolean;
  rebuiltSales: readonly SaleRebuiltAgainstPaidOrder[];
}): boolean {
  return (
    convertedIntoRefund ||
    rebuiltSales.some(
      ({ state, paymentApplied }) =>
        state === "COMPLETED" || (state === "CANCELLED" && paymentApplied),
    )
  );
}

export type RebuildablePaidOrder = {
  paymentTransactionId: string;
  amount: number;
  resolved: boolean;
} & (
  | Pick<MercadoPagoQrPaymentTransaction, "method" | "provider" | "cardType">
  | Pick<MercadoPagoPointPaymentTransaction, "method" | "provider" | "cardType">
);
