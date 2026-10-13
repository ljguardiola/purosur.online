import { argentinaCalendarDay, isValidCashAmount, shiftCalendarDay } from "../../shared/index.js";
import { isPurchaseNoteTooLong, PURCHASE_NOTE_MAX_LENGTH } from "./purchase.js";
import { isSupplierNameTooLong, SUPPLIER_NAME_MAX_LENGTH } from "./supplier.js";

export type FreightMeans = { kind: "carrier"; name: string } | { kind: "own_trip" };

export const MIN_FREIGHT_PURCHASES = 1;

export const FREIGHT_DESCRIPTION_MAX_LENGTH = PURCHASE_NOTE_MAX_LENGTH;

export const FREIGHT_CARRIER_NAME_MAX_LENGTH = SUPPLIER_NAME_MAX_LENGTH;

export const FREIGHT_PERIOD_DAYS = [30, 90, 365] as const;

export type FreightPeriodDays = (typeof FREIGHT_PERIOD_DAYS)[number];

function hasVisibleCharacter(text: string): boolean {
  return text.trim() !== "";
}

export function isFreightAmount(cents: number): boolean {
  return isValidCashAmount(cents) && cents > 0;
}

export function isFreightDescriptionTooLong(description: string): boolean {
  return isPurchaseNoteTooLong(description);
}

export function isFreightCarrierNameTooLong(name: string): boolean {
  return isSupplierNameTooLong(name);
}

export function isFreightDescription(description: string): boolean {
  return hasVisibleCharacter(description) && !isFreightDescriptionTooLong(description);
}

export function isValidFreightMeans(means: FreightMeans): boolean {
  return (
    means.kind === "own_trip" ||
    (hasVisibleCharacter(means.name) && !isFreightCarrierNameTooLong(means.name))
  );
}

export function hasFreightPurchases(purchaseCount: number): boolean {
  return purchaseCount >= MIN_FREIGHT_PURCHASES;
}

export function freightPeriodStart(period: FreightPeriodDays, now: Date): string {
  return shiftCalendarDay(argentinaCalendarDay(now), -period);
}
