import {
  isInActivityScope,
  type ProductActivityScope,
  type SaleUnit,
} from "../../catalog/index.js";
import { codePointLength } from "../../shared/index.js";
import { isMovementQuantity } from "../../stock/index.js";

export const PACKAGING_NAME_MAX_LENGTH = 100;

export const PRODUCTS_PACKAGINGS_MAY_BE_DEFINED_FOR: ProductActivityScope = "active";

export function isPackagingNameTooLong(name: string): boolean {
  return codePointLength(name) > PACKAGING_NAME_MAX_LENGTH;
}

export function mayDefinePackagingsFor(product: { active: boolean }): boolean {
  return isInActivityScope(product.active, PRODUCTS_PACKAGINGS_MAY_BE_DEFINED_FOR);
}

export function isQuantityPerPackage(saleUnit: SaleUnit, quantity: number): boolean {
  return isMovementQuantity(saleUnit, quantity);
}
