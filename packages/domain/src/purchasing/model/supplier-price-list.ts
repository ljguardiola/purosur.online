import { codePointLength, isValidCashAmount } from "../../shared/index.js";

export const SUPPLIER_PRICE_LIST_STATES = [
  "READING",
  "READ_FAILED",
  "EXTRACTED",
  "REVIEWED",
  "DISCARDED",
] as const;

export type SupplierPriceListState = (typeof SUPPLIER_PRICE_LIST_STATES)[number];

export const SUPPLIER_PRICE_LIST_SOURCE_KINDS = ["PDF", "WEB"] as const;

export type SupplierPriceListSourceKind = (typeof SUPPLIER_PRICE_LIST_SOURCE_KINDS)[number];

export const SUPPLIER_PRICE_LIST_READ_FAILURES = [
  "unreadable_document",
  "no_items_found",
  "reading_unavailable",
  "interrupted",
] as const;

export type SupplierPriceListReadFailure = (typeof SUPPLIER_PRICE_LIST_READ_FAILURES)[number];

export const SUPPLIER_PRICE_LIST_PDF_MAX_BYTES = 20 * 1024 * 1024;

export const SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH = 255;

export const DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP = 10;

export function isSupplierPriceListPdfTooLarge(byteLength: number): boolean {
  return byteLength > SUPPLIER_PRICE_LIST_PDF_MAX_BYTES;
}

export function isSupplierPriceListFileNameTooLong(fileName: string): boolean {
  return codePointLength(fileName) > SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH;
}

// An extraction counts on the Argentina calendar day it was sent to the AI service, whatever its
// outcome. One still waiting to be read counts too, because it will be sent.
export function countsTowardDailyExtractionCap(
  list: { state: SupplierPriceListState; sentOn: string | null },
  day: string,
): boolean {
  return list.sentOn === day || (list.state === "READING" && list.sentOn === null);
}

export function dailyExtractionCapReached(countedToday: number, cap: number): boolean {
  return countedToday >= cap;
}

export function isPriceListRowPrice(cents: number): boolean {
  return isValidCashAmount(cents);
}

export function isSourcePage(page: number): boolean {
  return Number.isInteger(page) && page > 0;
}

type ConfirmationRefusal = "no_rows" | "unpriced_rows" | "list_date_missing";

export type ConfirmationDecision =
  | { kind: "refused"; reason: ConfirmationRefusal }
  | { kind: "confirmable"; listDate: string };

// The date a person typed in the review wins over the one the reading found.
export function decideConfirmation(list: {
  rowPrices: (number | null)[];
  readListDate: string | null;
  typedListDate: string | null;
}): ConfirmationDecision {
  if (list.rowPrices.length === 0) {
    return { kind: "refused", reason: "no_rows" };
  }
  if (list.rowPrices.some((price) => price === null)) {
    return { kind: "refused", reason: "unpriced_rows" };
  }
  const listDate = list.typedListDate ?? list.readListDate;
  if (listDate === null) {
    return { kind: "refused", reason: "list_date_missing" };
  }
  return { kind: "confirmable", listDate };
}

export interface ConfirmedListDates {
  id: string;
  listDate: string;
  confirmedAt: Date;
}

// The supplier's newest list by its date is the one every comparison and reference cost uses; a
// tie goes to the one confirmed later. The others stay as history.
export function currentConfirmedListId(lists: ConfirmedListDates[]): string | null {
  let current: ConfirmedListDates | null = null;
  for (const list of lists) {
    if (
      current === null ||
      list.listDate > current.listDate ||
      (list.listDate === current.listDate &&
        list.confirmedAt.getTime() > current.confirmedAt.getTime())
    ) {
      current = list;
    }
  }
  return current?.id ?? null;
}
