import type { PrintedDocument } from "./printed-document.js";

interface PrintTimes {
  printAttemptedAt: Date;
  printedAt: Date | null;
}

export type SalePrintState = PrintTimes &
  (
    | { saleId: string; document: Exclude<PrintedDocument, "credit_note"> }
    | { saleId: string; document: "credit_note"; creditNoteId: string | null }
  );

type SaleReprintReason = { kind: "retry" } | { kind: "requested"; text: string };

export interface SaleReprint {
  saleId: string;
  document: PrintedDocument;
  orderNumber: number;
  requestedBy: string;
  authorizedBy: string | null;
  reason: SaleReprintReason;
  occurredAt: Date;
}
