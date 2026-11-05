import type { PurchaseSummary } from "@purosur/contracts";
import { formatCents, formatNumber } from "@purosur/ui";
import { formatStockQuantity } from "../platform/stock-quantity";

type PurchaseLine = PurchaseSummary["lines"][number];

export function quantityOf(line: PurchaseLine): string {
  const quantity = formatStockQuantity(line.quantity, line.product.saleUnit);
  return line.packages === null
    ? quantity
    : `${formatNumber(line.packages)} × ${formatStockQuantity(line.quantityPerPackage, line.product.saleUnit)} (${quantity})`;
}

function saleUnitName(line: PurchaseLine): string {
  return line.product.saleUnit === "KG" ? "kg" : "u";
}

export function unitCostOf(line: PurchaseLine): string {
  return `${formatCents(line.unitCostCents)} por ${saleUnitName(line)}`;
}

export function costPaidOf(line: PurchaseLine): string {
  return `${formatCents(line.costPaidCents)} por ${line.packages === null ? saleUnitName(line) : "paquete"}`;
}
