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

interface ReprintFacts {
  saleId: string;
  orderNumber: number;
  requestedBy: string;
  authorizedBy: string | null;
  reason: SaleReprintReason;
  occurredAt: Date;
}

export type SaleReprint = ReprintFacts &
  (
    | { document: Exclude<PrintedDocument, "credit_note"> }
    | { document: "credit_note"; creditNoteId: string | null }
  );
