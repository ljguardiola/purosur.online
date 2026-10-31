import type { SaleUnit } from "../../catalog/index.js";
import { isMovementQuantity } from "../../stock/index.js";
import type { SupplierItemQuantityReading } from "./supplier-item-quantity-reader.js";

export function linkableQuantityOrNull(saleUnit: SaleUnit, quantity: number | null): number | null {
  return quantity !== null && isMovementQuantity(saleUnit, quantity) ? quantity : null;
}

export async function readingOrUnavailable(
  read: () => Promise<SupplierItemQuantityReading>,
): Promise<SupplierItemQuantityReading> {
  try {
    return await read();
  } catch {
    return { kind: "unavailable" };
  }
}
