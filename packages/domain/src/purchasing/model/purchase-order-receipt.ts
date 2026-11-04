import { type Fraction, roundHalfUp } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";
import { lineValue, type PurchaseLineCost, packagedQuantity } from "./purchase-line.js";
import { mayBeReceived, type PurchaseOrderState } from "./purchase-order.js";

export function outstandingQuantity(
  line: { packages: number; quantityPerPackage: number },
  receivedSoFar: number,
): number {
  return Math.max(0, packagedQuantity(line.packages, line.quantityPerPackage) - receivedSoFar);
}

export function orderLineOutstandingQuantity(
  state: PurchaseOrderState,
  line: { packages: number; quantityPerPackage: number },
  receivedSoFar: number,
): number {
  return state === "CANCELLED" ? 0 : outstandingQuantity(line, receivedSoFar);
}

export function awaitedQuantity(
  state: PurchaseOrderState,
  line: { packages: number; quantityPerPackage: number },
  receivedSoFar: number,
): number {
  return mayBeReceived(state) ? outstandingQuantity(line, receivedSoFar) : 0;
}

export function missingQuantity(outstanding: number, received: number): number {
  return Math.max(0, outstanding - received);
}

// Cents, VAT included: positive when more was paid than the supplier's list cost of each package
// that arrived, rounded to a cent as a receipt's draft prefills it.
export function priceDifferenceCents(
  paidLines: readonly PurchaseLineCost[],
  listPricePerSaleUnit: Fraction | null,
): number | null {
  if (listPricePerSaleUnit === null || paidLines.every((line) => line.quantity === 0)) {
    return null;
  }
  let difference: Fraction = { numerator: 0n, denominator: 1n };
  for (const line of paidLines) {
    const paid = lineValue(line);
    const listed = lineValue({
      ...line,
      costPaidCents: listCostCents(listPricePerSaleUnit, line.quantityPerPackage),
    });
    difference = {
      numerator:
        difference.numerator * paid.denominator +
        (paid.numerator - listed.numerator) * difference.denominator,
      denominator: difference.denominator * paid.denominator,
    };
  }
  return roundHalfUp(difference);
}

export function hasReceiptDifference(line: {
  missingQuantity: number;
  priceDifferenceCents: number | null;
}): boolean {
  return (
    line.missingQuantity > 0 ||
    (line.priceDifferenceCents !== null && line.priceDifferenceCents !== 0)
  );
}

export function stateAfterReceipt(
  missingPerLine: readonly number[],
): Extract<PurchaseOrderState, "PARTIALLY_RECEIVED" | "RECEIVED"> {
  return missingPerLine.every((missing) => missing === 0) ? "RECEIVED" : "PARTIALLY_RECEIVED";
}

export type OutstandingLoad =
  | { loadedBy: "packages"; packages: number }
  | { loadedBy: "quantity"; quantity: number };

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
