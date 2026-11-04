import { type CalendarDate, parseDate } from "@internationalized/date";
import type { PurchaseHeaderCorrectionBody, PurchaseSummary } from "@purosur/contracts";
import type { ReceiptType } from "@purosur/domain";
import {
  PURCHASE_RECEIPT_TYPE_REQUIRED,
  purchaseDateMessage,
  purchaseNoteMessage,
  purchaseReceiptNumberMessage,
} from "./purchase-form";

export type PurchaseHeaderValues = {
  purchasedOn: CalendarDate | null;
  receiptType: ReceiptType | null;
  receiptNumber: string;
  note: string;
};

type PurchaseHeaderRequest = Omit<PurchaseHeaderCorrectionBody, "receiptType"> & {
  receiptType: ReceiptType | null;
};

export const EMPTY_PURCHASE_HEADER: PurchaseHeaderValues = {
  purchasedOn: null,
  receiptType: null,
  receiptNumber: "",
  note: "",
};

export function purchaseHeaderValuesOf(
  purchase: Pick<PurchaseSummary, "purchasedOn" | "receiptType" | "receiptNumber" | "note">,
): PurchaseHeaderValues {
  return {
    purchasedOn: parseDate(purchase.purchasedOn),
    receiptType: purchase.receiptType,
    receiptNumber: purchase.receiptNumber ?? "",
    note: purchase.note ?? "",
  };
}

export function purchaseHeaderCorrectionRequestFrom(
  values: PurchaseHeaderValues,
): PurchaseHeaderRequest {
  return {
    purchasedOn: values.purchasedOn?.toString() ?? "",
    receiptType: values.receiptType,
    receiptNumber: values.receiptNumber.trim(),
    note: values.note.trim(),
  };
}

export const PURCHASE_HEADER_FIELDS = {
  purchasedOn: "purchasedOn",
  receiptType: "receiptType",
  receiptNumber: "receiptNumber",
  note: "note",
} as const;

export const PURCHASE_HEADER_MESSAGES = {
  purchasedOn: purchaseDateMessage,
  receiptType: PURCHASE_RECEIPT_TYPE_REQUIRED,
  receiptNumber: purchaseReceiptNumberMessage,
  note: purchaseNoteMessage,
};
