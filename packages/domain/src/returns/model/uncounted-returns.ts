import type { ReturnedFromLine, SaleForReturn } from "./return-sale.js";

export interface LocalReturnOfSale {
  id: string;
  lines: ReturnedFromLine[];
  refunds: { paymentId: string; amount: number }[];
}

export function withUncountedReturns(
  facts: SaleForReturn,
  countedReturnIds: readonly string[],
  localReturns: readonly LocalReturnOfSale[],
): SaleForReturn {
  const uncounted = localReturns.filter(({ id }) => !countedReturnIds.includes(id));
  const returned = facts.returned.map((line) => ({ ...line }));
  for (const { lines } of uncounted) {
    for (const line of lines) {
      const earlier = returned.find(({ saleLineId }) => saleLineId === line.saleLineId);
      if (earlier === undefined) {
        returned.push({ ...line });
      } else {
        earlier.quantity += line.quantity;
        earlier.refundedAmount += line.refundedAmount;
      }
    }
  }
  const refunds = uncounted.flatMap((localReturn) => localReturn.refunds);
  const payments = facts.payments.map((payment) => ({
    ...payment,
    refundedAmount:
      payment.refundedAmount +
      refunds
        .filter(({ paymentId }) => paymentId === payment.id)
        .reduce((total, { amount }) => total + amount, 0),
  }));
  return { ...facts, returned, payments };
}
