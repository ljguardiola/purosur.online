export interface SalePrintState {
  saleId: string;
  printAttemptedAt: Date;
  printedAt: Date | null;
}

type SaleReprintReason = { kind: "retry" } | { kind: "requested"; text: string };

export interface SaleReprint {
  saleId: string;
  orderNumber: number;
  requestedBy: string;
  authorizedBy: string | null;
  reason: SaleReprintReason;
  occurredAt: Date;
}
