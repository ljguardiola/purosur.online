import { argentinaCalendarDay, isValidCashAmount, shiftCalendarDay } from "../../shared/index.js";
import { isPurchaseNoteTooLong } from "./purchase.js";
import { isSupplierNameTooLong } from "./supplier.js";

export type FreightMeans = { kind: "carrier"; name: string } | { kind: "own_trip" };

export const MIN_FREIGHT_PURCHASES = 1;

export const FREIGHT_PERIOD_DAYS = [30, 90, 365] as const;

export type FreightPeriodDays = (typeof FREIGHT_PERIOD_DAYS)[number];

function hasVisibleCharacter(text: string): boolean {
  return text.trim() !== "";
}

export function isFreightAmount(cents: number): boolean {
  return isValidCashAmount(cents) && cents > 0;
}

export function isFreightDescription(description: string): boolean {
  return hasVisibleCharacter(description) && !isPurchaseNoteTooLong(description);
}

export function isValidFreightMeans(means: FreightMeans): boolean {
  return (
    means.kind === "own_trip" ||
    (hasVisibleCharacter(means.name) && !isSupplierNameTooLong(means.name))
  );
}

export function hasFreightPurchases(purchaseCount: number): boolean {
  return purchaseCount >= MIN_FREIGHT_PURCHASES;
}

export function freightPeriodStart(period: FreightPeriodDays, now: Date): string {
  return shiftCalendarDay(argentinaCalendarDay(now), -period);
}
