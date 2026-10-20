import type {
  FiscalOnlineSignalEvidence,
  SaleInvoice,
  SaleVoidCreditNote,
} from "../../fiscal/index.js";
import type { PaymentTransaction } from "../../payments/index.js";
import type { CashMovement } from "../../register/index.js";
import type { OutboxEventDraft } from "../../shared/index.js";
import type { SaleWithLines } from "../model/sale.js";
import type { DeferredSaleRecord } from "../model/sale-history.js";
import type { SaleCashMovement, SaleRefund, SaleStockMovement } from "./sale-ledger.js";

export interface SaleToVoid {
  sale: SaleWithLines;
  inOpenSession: boolean;
  payments: (PaymentTransaction & { occurredAt: Date })[];
  fiscalDocuments: SaleInvoice[];
  deferredRecord: DeferredSaleRecord | null;
  stockMovements: SaleStockMovement[];
}

export interface SaleVoidLedger {
  transaction<TOutcome>(work: (tx: SaleVoidTransaction) => TOutcome): TOutcome;
}

export interface SaleVoidTransaction {
  saleToVoid(saleId: string): SaleToVoid | undefined;
  saleCashMovements(saleId: string): SaleCashMovement[];
  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence;
  outboxReady(): boolean;
  recordVoidedSale(saleId: string, voidedAt: Date, authorizedBy: string | undefined): void;
  recordRefund(refund: SaleRefund): void;
  recordCashMovement(movement: CashMovement): void;
  recordSaleVoidStockMovement(movement: SaleStockMovement): void;
  addToStockBalance(productId: string, delta: number): void;
  cancelDeferredSale(saleId: string, cancelledAt: Date): void;
  recordPendingCreditNote(creditNote: SaleVoidCreditNote): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}
