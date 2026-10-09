import { codePointLength } from "../../shared/index.js";

export const RECEIPT_REPRINT_REASON_MAX_LENGTH = 200;

export function receiptReprintReason(typed: string): string | undefined {
  const reason = typed.trim();
  if (reason === "" || codePointLength(reason) > RECEIPT_REPRINT_REASON_MAX_LENGTH) {
    return undefined;
  }
  return reason;
}
