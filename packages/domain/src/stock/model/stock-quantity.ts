import type { SaleUnit } from "../../catalog/index.js";

// Thousandths of the sale unit, so every balance is an exact integer sum: a gram of a product sold
// by the kilo, a thousandth of one sold by the unit.
export const STOCK_QUANTITY_PER_UNIT = 1000;

// Caps a single movement's or count's quantity (over two million kilos or units) so the sums a
// balance is built from stay far inside the integers a JavaScript number holds exactly.
export const MAX_STOCK_QUANTITY = 2_147_483_647;

export function isCountedQuantity(saleUnit: SaleUnit, quantity: number): boolean {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_STOCK_QUANTITY) {
    return false;
  }
  return saleUnit === "KG" || quantity % STOCK_QUANTITY_PER_UNIT === 0;
}

export function isMovementQuantity(saleUnit: SaleUnit, quantity: number): boolean {
  return quantity > 0 && isCountedQuantity(saleUnit, quantity);
}
