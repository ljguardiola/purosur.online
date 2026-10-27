import { type LotsValueSummary, lotsValueSummary } from "./lot-value.js";

export function holdsCurrentStock({
  balance,
  lotCount,
}: {
  balance: number;
  lotCount: number;
}): boolean {
  return balance !== 0 || lotCount > 0;
}

export interface CurrentStockSummary extends LotsValueSummary {
  productCount: number;
  negativeBalanceCount: number;
}

export function currentStockSummary(
  products: readonly { balance: number; valueCents: number | null }[],
): CurrentStockSummary {
  return {
    ...lotsValueSummary(products),
    productCount: products.length,
    negativeBalanceCount: products.filter(({ balance }) => balance < 0).length,
  };
}
