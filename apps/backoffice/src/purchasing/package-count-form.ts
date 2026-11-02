import type { SaleUnit } from "@purosur/domain";
import { parseEsArNumber } from "@purosur/ui";
import { parseStockQuantity } from "../platform/stock-quantity";

export function packageCountOf(packages: string): number {
  const digits = parseEsArNumber(packages, 0);
  return digits ? Number(digits.whole) : Number.NaN;
}

export function quantityPerPackageOf(quantityPerPackage: string, saleUnit: SaleUnit): number {
  return parseStockQuantity(quantityPerPackage, saleUnit) ?? Number.NaN;
}
