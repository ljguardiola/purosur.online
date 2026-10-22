import type { CreditNoteCFiscalBlock } from "../../fiscal/index.js";
import type { ReceiptContent } from "./receipt-content.js";

export interface CreditNoteReceiptContent {
  header: ReceiptContent["header"];
  operation: ReceiptContent["operation"];
  issuedOn: string;
  lines: ReceiptContent["lines"];
  totals: Pick<ReceiptContent["totals"], "subtotal" | "saleDiscount" | "total">;
  refunds: { method: ReceiptContent["totals"]["payments"][number]["method"]; amount: number }[];
  fiscal: CreditNoteCFiscalBlock;
}
