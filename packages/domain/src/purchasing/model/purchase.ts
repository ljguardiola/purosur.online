import { isInActivityScope, type ProductActivityScope } from "../../catalog/index.js";
import { argentinaCalendarDay, codePointLength } from "../../shared/index.js";

export const RECEIPT_TYPES = [
  "factura_b",
  "factura_c",
  "remito",
  "ticket",
  "otro",
  "sin_comprobante",
] as const;

export type ReceiptType = (typeof RECEIPT_TYPES)[number];

const NO_RECEIPT: ReceiptType = "sin_comprobante";

// Supplier receipt numbers are printed as 0001-00001234 (13 characters); the rest is slack for
// longer formats.
export const RECEIPT_NUMBER_MAX_LENGTH = 50;

// Lot codes printed by suppliers are short alphanumeric strings.
export const LOT_NUMBER_MAX_LENGTH = 50;

export const PURCHASE_NOTE_MAX_LENGTH = 200;

export const MIN_PURCHASE_LINES = 1;

export const PRODUCTS_PURCHASES_MAY_BE_REGISTERED_FOR: ProductActivityScope = "active";

export function mayBePurchased(product: { active: boolean }): boolean {
  return isInActivityScope(product.active, PRODUCTS_PURCHASES_MAY_BE_REGISTERED_FOR);
}

export function mayBePurchasedFrom(supplier: { active: boolean }): boolean {
  return supplier.active;
}

export function hasValidReceiptNumber(type: ReceiptType, number: string | null): boolean {
  return type === NO_RECEIPT ? number === null : number !== null;
}

export function isReceiptNumberTooLong(number: string): boolean {
  return codePointLength(number) > RECEIPT_NUMBER_MAX_LENGTH;
}

export function isLotNumberTooLong(number: string): boolean {
  return codePointLength(number) > LOT_NUMBER_MAX_LENGTH;
}

export function isPurchaseNoteTooLong(note: string): boolean {
  return codePointLength(note) > PURCHASE_NOTE_MAX_LENGTH;
}

export function hasPurchaseLines(lineCount: number): boolean {
  return lineCount >= MIN_PURCHASE_LINES;
}

// ISO calendar days order the same as the days they name.
export function isPurchaseDateInFuture(purchasedOn: string, now: Date): boolean {
  return purchasedOn > argentinaCalendarDay(now);
}
