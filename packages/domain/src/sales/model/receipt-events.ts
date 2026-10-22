import type { PrintedDocument } from "./printed-document.js";

export interface SalePrintState {
  saleId: string;
  document: PrintedDocument;
  printAttemptedAt: Date;
  printedAt: Date | null;
}

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
