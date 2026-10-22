import type { ReceiptCopyShown } from "@purosur/contracts";
import type { ReceiptCopy } from "@purosur/domain";

export function toWireCopy(copy: ReceiptCopy): ReceiptCopyShown {
  return copy.kind === "original" ? copy : { kind: "duplicate", order_number: copy.orderNumber };
}
