import type { OutboxEventDraft } from "../../shared/index.js";
import type { ReceiptContent, ReceiptSource } from "../model/receipt-content.js";
import type { ReceiptCopy, ReceiptDelivery } from "../model/receipt-copy.js";
import type { PrinterStatus } from "../model/receipt-print-standing.js";

export interface StoredReceipt {
  templateVersion: string;
  head: Uint8Array;
  body: Uint8Array;
}

export type ReceiptReason = { kind: "retry" } | { kind: "requested"; text: string };

export interface ReceiptReprint {
  saleId: string;
  orderNumber: number;
  requestedBy: string;
  authorizedBy: string | null;
  reason: ReceiptReason;
  occurredAt: Date;
}

export interface ReceiptLedger {
  transaction<TOutcome>(work: (tx: ReceiptLedgerTransaction) => TOutcome): TOutcome;
}

export interface ReceiptLedgerTransaction {
  receiptDelivery(saleId: string): ReceiptDelivery | undefined;
  receiptSource(saleId: string): ReceiptSource;
  storedReceipt(saleId: string): StoredReceipt | undefined;
  recordStoredReceipt(saleId: string, receipt: StoredReceipt): void;
  recordPrintAttempt(saleId: string, at: Date): void;
  recordPrinted(saleId: string, at: Date): void;
  recordReprint(reprint: ReceiptReprint): void;
  outboxReady(): boolean;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}

export interface ReceiptTemplate {
  render(content: ReceiptContent): StoredReceipt;
  printable(stored: StoredReceipt, copy: ReceiptCopy): Uint8Array;
}

export interface ReceiptPrintWatch {
  onStatus(status: PrinterStatus): void;
  signal: AbortSignal;
}

export type ReceiptPrintEnding = { kind: "acknowledged" } | { kind: "abandoned" };

export interface ReceiptPrinter {
  print(receipt: Uint8Array, watch: ReceiptPrintWatch): Promise<ReceiptPrintEnding>;
}
