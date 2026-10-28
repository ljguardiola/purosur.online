import {
  compareFractions,
  compareSpanishText,
  type Fraction,
  isValidCashAmount,
} from "../../shared/index.js";
import type { LotCost } from "./lot-value.js";
import { STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";

export function referenceCostOf(unitCostCents: number): LotCost {
  return { totalCents: unitCostCents, quantity: STOCK_QUANTITY_PER_UNIT };
}

export function isReferenceUnitCost(cents: number): boolean {
  return cents > 0 && isValidCashAmount(cents);
}

// The latest price a supplier's loaded list gives a product's item: cents per sale unit, VAT
// included, exact.
export interface LoadedSupplierPrice {
  supplierItemId: string;
  supplierName: string;
  packagingName: string;
  listDate: string;
  pricePerSaleUnit: Fraction;
}

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  return b === 0n ? a : greatestCommonDivisor(b, a % b);
}

// The price over the sale units of its denominator, never rounded; null when the exact cost does
// not fit the whole numbers a cost is stored in.
export function referenceCostOfPrice(pricePerSaleUnit: Fraction): LotCost | null {
  const quantity = pricePerSaleUnit.denominator * BigInt(STOCK_QUANTITY_PER_UNIT);
  const divisor = greatestCommonDivisor(pricePerSaleUnit.numerator, quantity);
  const totalCents = pricePerSaleUnit.numerator / divisor;
  const reducedQuantity = quantity / divisor;
  const largest = BigInt(Number.MAX_SAFE_INTEGER);
  return totalCents > largest || reducedQuantity > largest
    ? null
    : { totalCents: Number(totalCents), quantity: Number(reducedQuantity) };
}

export function lotCostIsPrice(cost: LotCost | null, pricePerSaleUnit: Fraction): boolean {
  return (
    cost !== null &&
    compareFractions(
      {
        numerator: BigInt(cost.totalCents) * BigInt(STOCK_QUANTITY_PER_UNIT),
        denominator: BigInt(cost.quantity),
      },
      pricePerSaleUnit,
    ) === 0
  );
}

export function cheapestFirst(prices: readonly LoadedSupplierPrice[]): LoadedSupplierPrice[] {
  return [...prices].sort(
    (a, b) =>
      compareFractions(a.pricePerSaleUnit, b.pricePerSaleUnit) ||
      compareSpanishText(a.supplierName, b.supplierName) ||
      compareSpanishText(a.supplierItemId, b.supplierItemId),
  );
}

export function selectableSupplierPrices(
  prices: readonly LoadedSupplierPrice[],
): LoadedSupplierPrice[] {
  return cheapestFirst(prices).filter(
    ({ pricePerSaleUnit }) => referenceCostOfPrice(pricePerSaleUnit) !== null,
  );
}

export function proposedReferenceCost(prices: readonly LoadedSupplierPrice[]): LotCost | null {
  const [cheapest] = selectableSupplierPrices(prices);
  return cheapest === undefined ? null : referenceCostOfPrice(cheapest.pricePerSaleUnit);
}
