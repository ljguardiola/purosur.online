export function isListedInStockBalances(params: { active: boolean; balance: number }): boolean {
  return params.active || params.balance !== 0;
}

export interface StockBalancesSummary {
  productCount: number;
  valueCents: number;
  withoutCostCount: number;
}

export function stockBalancesSummary(
  products: readonly { hasMoved: boolean; valueCents: number | null }[],
): StockBalancesSummary {
  const moved = products.filter(({ hasMoved }) => hasMoved);
  return {
    productCount: moved.length,
    valueCents: moved.reduce((sum, { valueCents }) => sum + (valueCents ?? 0), 0),
    withoutCostCount: moved.filter(({ valueCents }) => valueCents === null).length,
  };
}
