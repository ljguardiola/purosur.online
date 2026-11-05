import { type CalendarDate, parseDate } from "@internationalized/date";
import type { PurchaseLineExpirySplitBody, PurchaseSummary } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { parseStockQuantity, quantityMessage } from "../platform/stock-quantity";

export type PurchaseLineExpirySplitValues = { quantity: string; expiresOn: CalendarDate | null };

export const EMPTY_PURCHASE_LINE_EXPIRY_SPLIT: PurchaseLineExpirySplitValues = {
  quantity: "",
  expiresOn: null,
};

export function purchaseLineExpirySplitValuesOf(
  line: Pick<PurchaseSummary["lines"][number], "expiresOn">,
): PurchaseLineExpirySplitValues {
  return {
    quantity: "",
    expiresOn: line.expiresOn === null ? null : parseDate(line.expiresOn),
  };
}

export function purchaseLineExpirySplitRequestFrom(
  { quantity, expiresOn }: PurchaseLineExpirySplitValues,
  saleUnit: SaleUnit,
): PurchaseLineExpirySplitBody {
  return {
    quantity: parseStockQuantity(quantity, saleUnit) ?? Number.NaN,
    expiresOn: expiresOn?.toString() ?? null,
  };
}

export const PURCHASE_LINE_EXPIRY_SPLIT_FIELDS = {
  quantity: "quantity",
  expiresOn: "expiresOn",
} as const;

export function purchaseLineExpirySplitMessages(saleUnit: SaleUnit) {
  return {
    quantity: quantityMessage(saleUnit),
    expiresOn: "Ingresá una fecha de vencimiento válida.",
  };
}
