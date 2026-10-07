export interface SaleBalance {
  paid: number;
  pending: number;
}

export function saleBalance(
  total: number,
  payments: readonly { amount: number; state: string }[],
): SaleBalance {
  const paid = payments
    .filter((payment) => payment.state === "APPROVED")
    .reduce((sum, payment) => sum + payment.amount, 0);
  return { paid, pending: total - paid };
}
