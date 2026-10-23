import { CREDIT_NOTE_C_VOUCHER_TYPE } from "./credit-note.js";
import { FACTURA_C_VOUCHER_TYPE } from "./factura-c-fiscal-block.js";
import { FACTURA_C_DOCUMENT_TYPE } from "./fiscal-rejection-standing.js";
export const CREDIT_NOTE_C_DOCUMENT_TYPE = "credit_note_c";

export const OFFLINE_SERIES_DOCUMENT_TYPES = [
  FACTURA_C_DOCUMENT_TYPE,
  CREDIT_NOTE_C_DOCUMENT_TYPE,
] as const;
export type OfflineSeriesDocumentType = (typeof OFFLINE_SERIES_DOCUMENT_TYPES)[number];

export function voucherTypeOfDocumentType(documentType: OfflineSeriesDocumentType): number {
  return documentType === CREDIT_NOTE_C_DOCUMENT_TYPE
    ? CREDIT_NOTE_C_VOUCHER_TYPE
    : FACTURA_C_VOUCHER_TYPE;
}
