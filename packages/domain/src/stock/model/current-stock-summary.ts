export function holdsCurrentStock({
  balance,
  lotCount,
}: {
  balance: number;
  lotCount: number;
}): boolean {
  return balance !== 0 || lotCount > 0;
}

export interface CurrentStockSummary {
  valueCents: number;
  productCount: number;
  negativeBalanceCount: number;
  withoutCostCount: number;
}

export function currentStockSummary(
  products: readonly { balance: number; valueCents: number | null }[],
): CurrentStockSummary {
  return {
    valueCents: products.reduce((sum, { valueCents }) => sum + (valueCents ?? 0), 0),
    productCount: products.length,
    negativeBalanceCount: products.filter(({ balance }) => balance < 0).length,
    withoutCostCount: products.filter(({ valueCents }) => valueCents === null).length,
  };
}
