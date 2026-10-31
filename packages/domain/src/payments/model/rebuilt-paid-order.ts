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
