import type { CreditNoteCFiscalBlock, OfflineCreditNoteCFiscalBlock } from "../../fiscal/index.js";
import { roundHalfUp } from "../../shared/index.js";
import type { ReceiptContent } from "./receipt-content.js";

export interface CreditNoteReceiptContent {
  header: ReceiptContent["header"];
  operation: ReceiptContent["operation"];
  issuedOn: string;
  lines: ReceiptContent["lines"];
  totals: Pick<ReceiptContent["totals"], "subtotal" | "saleDiscount" | "total">;
  refunds: { method: ReceiptContent["totals"]["payments"][number]["method"]; amount: number }[];
  fiscal: CreditNoteCFiscalBlock | OfflineCreditNoteCFiscalBlock;
}

export function returnedReceiptLine(
  sold: ReceiptContent["lines"][number],
  returned: { quantity: number; refundedAmount: number },
): ReceiptContent["lines"][number] {
  const charged = roundHalfUp({
    numerator: BigInt(sold.lineTotal + sold.discountAmount) * BigInt(returned.quantity),
    denominator: BigInt(sold.quantity),
  });
  return {
    ...sold,
    quantity: returned.quantity,
    discountAmount: charged - returned.refundedAmount,
    lineTotal: returned.refundedAmount,
  };
}
