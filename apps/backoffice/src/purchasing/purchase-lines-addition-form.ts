import type { PurchaseLinesAdditionBody } from "@purosur/contracts";
import {
  emptyPurchaseLine,
  type PurchaseLineValues,
  type PurchaseProducts,
  purchaseLineRequestFrom,
  purchaseLinesMessage,
} from "./purchase-form";

export type PurchaseLinesAdditionValues = { lines: PurchaseLineValues[] };

export function emptyPurchaseLinesAddition(): PurchaseLinesAdditionValues {
  return { lines: [emptyPurchaseLine(1)] };
}

export function purchaseLinesAdditionRequestFrom(
  { lines }: PurchaseLinesAdditionValues,
  products: PurchaseProducts,
): PurchaseLinesAdditionBody {
  return { lines: lines.map((line) => purchaseLineRequestFrom(line, products)) };
}

export const PURCHASE_LINES_ADDITION_FIELDS = { lines: "lines" } as const;

export function purchaseLinesAdditionMessages(products: PurchaseProducts) {
  return { lines: (values: PurchaseLinesAdditionValues) => purchaseLinesMessage(values, products) };
}
