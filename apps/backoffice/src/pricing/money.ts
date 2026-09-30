import { MAX_UNIT_PRICE_CENTS } from "@purosur/domain";
import { formatNumber } from "@purosur/ui";
import type { ProductSaleUnit } from "../catalog/products-api";

export { MAX_UNIT_PRICE_CENTS };

export function formatCents(cents: number): string {
  return `$ ${formatNumber(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const UNIT_SUFFIX = { UNIT: "", KG: "/ kg" } satisfies Record<ProductSaleUnit, string>;

export function formatCentsWithUnit(cents: number, saleUnit: ProductSaleUnit): string {
  const suffix = UNIT_SUFFIX[saleUnit];
  return suffix ? `${formatCents(cents)} ${suffix}` : formatCents(cents);
}
