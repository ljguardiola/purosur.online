import { type Fraction, roundHalfUp } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";
import { lineValue, type PurchaseLineCost, packagedQuantity } from "./purchase-line.js";
import type { PurchaseOrderState } from "./purchase-order.js";

export function outstandingQuantity(
  line: { packages: number; quantityPerPackage: number },
  receivedSoFar: number,
): number {
  return Math.max(0, packagedQuantity(line.packages, line.quantityPerPackage) - receivedSoFar);
}

export function missingQuantity(outstanding: number, received: number): number {
  return Math.max(0, outstanding - received);
}

// Cents, VAT included: positive when more was paid than the supplier's list price for the quantity
// that arrived.
export function priceDifferenceCents(
  paidLines: readonly PurchaseLineCost[],
  listPricePerSaleUnit: Fraction | null,
): number | null {
  const received = paidLines.reduce((total, line) => total + line.quantity, 0);
  if (listPricePerSaleUnit === null || received === 0) {
    return null;
  }
  let paid: Fraction = { numerator: 0n, denominator: 1n };
  for (const line of paidLines) {
    const value = lineValue(line);
    paid = {
      numerator: paid.numerator * value.denominator + value.numerator * paid.denominator,
      denominator: paid.denominator * value.denominator,
    };
  }
  const listValue = {
    numerator: listPricePerSaleUnit.numerator * BigInt(received),
    denominator: listPricePerSaleUnit.denominator * BigInt(STOCK_QUANTITY_PER_UNIT),
  };
  return roundHalfUp({
    numerator: paid.numerator * listValue.denominator - listValue.numerator * paid.denominator,
    denominator: paid.denominator * listValue.denominator,
  });
}

export function stateAfterReceipt(
  missingPerLine: readonly number[],
): Extract<PurchaseOrderState, "PARTIALLY_RECEIVED" | "RECEIVED"> {
  return missingPerLine.every((missing) => missing === 0) ? "RECEIVED" : "PARTIALLY_RECEIVED";
}

export type OutstandingLoad =
  | { loadedBy: "packages"; packages: number }
  | { loadedBy: "quantity"; quantity: number };

// A line is loaded by packages only when what is outstanding is a whole number of them.
export function outstandingLoad(outstanding: number, quantityPerPackage: number): OutstandingLoad {
  return outstanding % quantityPerPackage === 0
    ? { loadedBy: "packages", packages: outstanding / quantityPerPackage }
    : { loadedBy: "quantity", quantity: outstanding };
}

// Cents, VAT included, of a quantity at the supplier's list price per sale unit.
export function listCostCents(pricePerSaleUnit: Fraction, quantity: number): number {
  return roundHalfUp({
    numerator: pricePerSaleUnit.numerator * BigInt(quantity),
    denominator: pricePerSaleUnit.denominator * BigInt(STOCK_QUANTITY_PER_UNIT),
  });
}
