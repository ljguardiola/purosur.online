import type { SaleUnit } from "@purosur/domain";
import { formatNumber, formatWeight } from "@purosur/ui";

export function saleUnitQuantityText(saleUnit: SaleUnit, quantity: number): string {
  return saleUnit === "KG" ? formatWeight(quantity) : `${formatNumber(quantity)} u`;
}
