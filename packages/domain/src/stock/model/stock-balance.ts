export function isListedInStockBalances(params: { active: boolean; balance: number }): boolean {
  return params.active || params.balance !== 0;
}

export interface StockBalancesSummary {
  productCount: number;
  valueCents: number;
  withoutCostCount: number;
}

export function stockBalancesSummary(
  products: readonly { valueCents: number | null }[],
): StockBalancesSummary {
  return {
    productCount: products.length,
    valueCents: products.reduce((sum, { valueCents }) => sum + (valueCents ?? 0), 0),
    withoutCostCount: products.filter(({ valueCents }) => valueCents === null).length,
  };
}
