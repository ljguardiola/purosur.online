import type { OutboxEventDraft } from "../../shared/index.js";
import type { CreditNoteReceiptContent } from "../model/credit-note-receipt-content.js";
import type { PrintedDocument, PrintedDocumentKey } from "../model/printed-document.js";
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
  document: PrintedDocument;
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
  receiptDelivery(key: PrintedDocumentKey): ReceiptDelivery | undefined;
  receiptSource(saleId: string): ReceiptSource;
  creditNoteContent(saleId: string): CreditNoteReceiptContent;
  storedReceipt(key: PrintedDocumentKey): StoredReceipt | undefined;
  recordStoredReceipt(key: PrintedDocumentKey, receipt: StoredReceipt): void;
  recordPrintAttempt(key: PrintedDocumentKey, at: Date): void;
  recordPrinted(key: PrintedDocumentKey, at: Date): void;
  recordReprint(reprint: ReceiptReprint): void;
  outboxReady(): boolean;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}

export interface ReceiptTemplate {
  render(content: ReceiptContent): StoredReceipt;
  renderCreditNote(content: CreditNoteReceiptContent): StoredReceipt;
  printable(stored: StoredReceipt, copy: ReceiptCopy): Uint8Array;
}

export interface ReceiptPrintWatch {
  onStatus(status: PrinterStatus): void;
  signal: AbortSignal;
}

export type ReceiptPrintEnding = { kind: "sent" } | { kind: "abandoned" };

export interface ReceiptPrinter {
  print(watch: ReceiptPrintWatch, sending: () => Uint8Array): Promise<ReceiptPrintEnding>;
}

export interface ReceiptPrinters {
  configured(): ReceiptPrinter | undefined;
}
