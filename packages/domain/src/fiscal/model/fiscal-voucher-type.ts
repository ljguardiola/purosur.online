import { CREDIT_NOTE_C_VOUCHER_TYPE } from "./credit-note.js";
import { FACTURA_C_VOUCHER_TYPE } from "./factura-c-fiscal-block.js";
import type { FiscalTaskDocumentType } from "./fiscal-task.js";

export function voucherTypeOfDocumentType(documentType: FiscalTaskDocumentType): number {
  return documentType === "credit_note_c" ? CREDIT_NOTE_C_VOUCHER_TYPE : FACTURA_C_VOUCHER_TYPE;
}
