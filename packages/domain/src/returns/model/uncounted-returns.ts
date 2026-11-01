import { countsAsReturned } from "./return-line.js";
import type { ReturnResolution } from "./return-reasons.js";
import type { ReturnedFromLine, SaleForReturn } from "./return-sale.js";

export interface LocalReturnOfSale {
  id: string;
  lines: (ReturnedFromLine & { resolution: ReturnResolution })[];
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
    for (const { resolution: _resolution, ...line } of lines.filter(countsAsReturned)) {
      const earlier = returned.find(({ saleLineId }) => saleLineId === line.saleLineId);
      if (earlier === undefined) {
        returned.push(line);
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

export function withReturnsOfBranch(
  heldHere: SaleForReturn,
  knownToBranch: SaleForReturn,
  countedReturnIds: readonly string[],
  localReturns: readonly LocalReturnOfSale[],
): SaleForReturn {
  const branch = withUncountedReturns(knownToBranch, countedReturnIds, localReturns);
  return {
    ...heldHere,
    returned: branch.returned,
    payments: heldHere.payments.map((payment) => ({
      ...payment,
      refundedAmount:
        branch.payments.find(({ id }) => id === payment.id)?.refundedAmount ??
        payment.refundedAmount,
    })),
  };
}
