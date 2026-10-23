import { CREDIT_NOTE_C_VOUCHER_TYPE } from "./credit-note.js";
import { FACTURA_C_VOUCHER_TYPE } from "./factura-c-fiscal-block.js";
import { FACTURA_C_DOCUMENT_TYPE } from "./fiscal-rejection-standing.js";
import { CREDIT_NOTE_C_DOCUMENT_TYPE, type FiscalTaskDocumentType } from "./fiscal-task.js";

export const OFFLINE_SERIES_DOCUMENT_TYPES = [
  FACTURA_C_DOCUMENT_TYPE,
  CREDIT_NOTE_C_DOCUMENT_TYPE,
] as const;

export function voucherTypeOfDocumentType(documentType: FiscalTaskDocumentType): number {
  return documentType === "credit_note_c" ? CREDIT_NOTE_C_VOUCHER_TYPE : FACTURA_C_VOUCHER_TYPE;
}
