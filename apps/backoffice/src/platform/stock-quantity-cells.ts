import type { SaleUnit } from "@purosur/domain";
import { type Cell, cell } from "./spreadsheet/workbook";
import { stockQuantityUnits } from "./stock-quantity";

export function stockQuantityCells(quantity: number, saleUnit: SaleUnit): [Cell, Cell] {
  return saleUnit === "KG"
    ? [cell.empty(), cell.weight(quantity)]
    : [cell.count(stockQuantityUnits(quantity)), cell.empty()];
}
