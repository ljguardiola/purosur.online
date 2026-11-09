import type { SoldQuantity } from "../../catalog/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";

export function soldStockDelta(sold: SoldQuantity): number {
  return sold.saleUnit === "UNIT" ? -sold.units * STOCK_QUANTITY_PER_UNIT : -sold.thousandths;
}
