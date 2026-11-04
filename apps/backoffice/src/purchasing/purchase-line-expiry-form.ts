import { type CalendarDate, parseDate } from "@internationalized/date";
import type { PurchaseLineExpiryCorrectionBody, PurchaseSummary } from "@purosur/contracts";

export type PurchaseLineExpiryValues = { expiresOn: CalendarDate | null };

export const EMPTY_PURCHASE_LINE_EXPIRY: PurchaseLineExpiryValues = { expiresOn: null };

export function purchaseLineExpiryValuesOf(
  line: Pick<PurchaseSummary["lines"][number], "expiresOn">,
): PurchaseLineExpiryValues {
  return { expiresOn: line.expiresOn === null ? null : parseDate(line.expiresOn) };
}

export function purchaseLineExpiryRequestFrom({
  expiresOn,
}: PurchaseLineExpiryValues): PurchaseLineExpiryCorrectionBody {
  return { expiresOn: expiresOn?.toString() ?? null };
}

export const PURCHASE_LINE_EXPIRY_FIELDS = { expiresOn: "expiresOn" } as const;

export const PURCHASE_LINE_EXPIRY_MESSAGES = {
  expiresOn: "Ingresá una fecha de vencimiento válida.",
};
