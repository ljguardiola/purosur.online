import type {
  OutboxEventDraft,
  PrintedDocumentKey,
  ReceiptDelivery,
  ReceiptSource,
} from "@purosur/domain";
import type {
  ReceiptLedger,
  ReceiptLedgerTransaction,
  ReceiptReprint,
  StoredReceipt,
} from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { readCreditNoteReceipt } from "./sqlite-credit-note-receipt";
import { readReceiptSource } from "./sqlite-receipt-source";

interface DeliveryRow {
  print_attempted_at: string | null;
  printed_at: string | null;
  reprint_count: number;
  voided: number;
  credit_note_authorized: number;
}

interface StoredReceiptRow {
  template_version: string;
  head: Buffer;
  body: Buffer;
}

interface PrintSlot {
  table: string;
  column: "sale_id" | "credit_note_id";
  value: string;
}

function printSlotOf(key: PrintedDocumentKey): PrintSlot | undefined {
  switch (key.document) {
    case "credit_note":
      return { table: "credit_note_prints", column: "credit_note_id", value: key.creditNoteId };
    case "deferred_invoice":
      return { table: "deferred_invoice_prints", column: "sale_id", value: key.saleId };
    case "sale_receipt":
      return undefined;
  }
}

export function markPrintAttempted(
  database: LocalDatabase,
  key: PrintedDocumentKey,
  at: Date,
): void {
  const slot = printSlotOf(key);
  if (slot !== undefined) {
    database
      .prepare(
        `INSERT INTO ${slot.table} (${slot.column}, print_attempted_at) VALUES (?, ?)
         ON CONFLICT (${slot.column}) DO UPDATE SET print_attempted_at = excluded.print_attempted_at`,
      )
      .run(slot.value, at.toISOString());
    return;
  }
  database
    .prepare("UPDATE sales SET print_attempted_at = ? WHERE id = ?")
    .run(at.toISOString(), key.saleId);
}

export function markPrinted(database: LocalDatabase, key: PrintedDocumentKey, at: Date): void {
  const slot = printSlotOf(key);
  if (slot !== undefined) {
    database
      .prepare(`UPDATE ${slot.table} SET printed_at = ? WHERE ${slot.column} = ?`)
      .run(at.toISOString(), slot.value);
    return;
  }
  database
    .prepare("UPDATE sales SET printed_at = ? WHERE id = ?")
    .run(at.toISOString(), key.saleId);
}

export function insertReprint(database: LocalDatabase, reprint: ReceiptReprint): void {
  database
    .prepare(
      `INSERT INTO sale_reprints (
         sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text,
         occurred_at
       ) VALUES (
         @sale_id, @document, @order_number, @requested_by, @authorized_by, @reason_kind,
         @reason_text, @occurred_at
       )`,
    )
    .run({
      sale_id: reprint.saleId,
      document: reprint.document,
      order_number: reprint.orderNumber,
      requested_by: reprint.requestedBy,
      authorized_by: reprint.authorizedBy,
      reason_kind: reprint.reason.kind,
      reason_text: reprint.reason.kind === "requested" ? reprint.reason.text : null,
      occurred_at: reprint.occurredAt.toISOString(),
    });
}

export class SqliteReceiptLedger implements ReceiptLedger {
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, outboxChainKey?: string) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: ReceiptLedgerTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): ReceiptLedgerTransaction {
    return {
      receiptDelivery: (key) => this.receiptDelivery(key),
      receiptSource: (saleId) => this.receiptSource(saleId),
      creditNoteContent: (creditNoteId) => this.creditNoteContent(creditNoteId),
      storedReceipt: (key) => this.storedReceipt(key),
      recordStoredReceipt: (key, receipt) => this.recordStoredReceipt(key, receipt),
      recordPrintAttempt: (key, at) => markPrintAttempted(this.database, key, at),
      recordPrinted: (key, at) => markPrinted(this.database, key, at),
      recordReprint: (_key, reprint) => insertReprint(this.database, reprint),
      outboxReady: () => this.outboxChainKey !== undefined,
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
    };
  }

  private receiptDelivery(key: PrintedDocumentKey): ReceiptDelivery | undefined {
    const row = this.database
      .prepare<{ sale_id: string; document: string; credit_note_id: string | null }, DeliveryRow>(
        `SELECT CASE @document
                  WHEN 'credit_note'
                    THEN (SELECT print_attempted_at FROM credit_note_prints WHERE credit_note_id = @credit_note_id)
                  WHEN 'deferred_invoice'
                    THEN (SELECT print_attempted_at FROM deferred_invoice_prints WHERE sale_id = sales.id)
                  ELSE print_attempted_at END AS print_attempted_at,
                CASE @document
                  WHEN 'credit_note'
                    THEN (SELECT printed_at FROM credit_note_prints WHERE credit_note_id = @credit_note_id)
                  WHEN 'deferred_invoice'
                    THEN (SELECT printed_at FROM deferred_invoice_prints WHERE sale_id = sales.id)
                  ELSE printed_at END AS printed_at,
                (SELECT count(*) FROM sale_reprints
                  WHERE sale_reprints.sale_id = sales.id AND sale_reprints.document = @document) AS reprint_count,
                (state = 'VOIDED') AS voided,
                EXISTS (SELECT 1 FROM sale_credit_notes
                  WHERE sale_credit_notes.id = @credit_note_id
                    AND sale_credit_notes.sale_id = sales.id
                    AND sale_credit_notes.state IN ('AUTHORIZED', 'ISSUED_OFFLINE')) AS credit_note_authorized
         FROM sales WHERE id = @sale_id AND state IN ('COMPLETED', 'VOIDED')`,
      )
      .get({
        sale_id: key.saleId,
        document: key.document,
        credit_note_id: key.document === "credit_note" ? key.creditNoteId : null,
      });
    return row === undefined
      ? undefined
      : {
          printAttemptedAt:
            row.print_attempted_at === null ? null : new Date(row.print_attempted_at),
          printedAt: row.printed_at === null ? null : new Date(row.printed_at),
          reprintCount: row.reprint_count,
          voided: row.voided === 1,
          creditNoteAuthorized: row.credit_note_authorized === 1,
        };
  }

  private receiptSource(saleId: string): ReceiptSource {
    return readReceiptSource(this.database, saleId, "COMPLETED");
  }

  private creditNoteContent(creditNoteId: string) {
    const content = readCreditNoteReceipt(this.database, creditNoteId);
    if (content === null) {
      throw new Error(`credit note ${creditNoteId} is not authorized`);
    }
    return content;
  }

  private storedReceipt(key: PrintedDocumentKey): StoredReceipt | undefined {
    const slot = this.storedSlotOf(key);
    const row = this.database
      .prepare<[string], StoredReceiptRow>(
        `SELECT template_version, head, body FROM ${slot.table} WHERE ${slot.column} = ?`,
      )
      .get(slot.value);
    return row === undefined
      ? undefined
      : {
          templateVersion: row.template_version,
          head: new Uint8Array(row.head),
          body: new Uint8Array(row.body),
        };
  }

  private recordStoredReceipt(key: PrintedDocumentKey, receipt: StoredReceipt): void {
    const slot = this.storedSlotOf(key);
    this.database
      .prepare(
        `INSERT INTO ${slot.table} (${slot.column}, template_version, head, body)
         VALUES (@value, @template_version, @head, @body)`,
      )
      .run({
        value: slot.value,
        template_version: receipt.templateVersion,
        head: Buffer.from(receipt.head),
        body: Buffer.from(receipt.body),
      });
  }

  private storedSlotOf(key: PrintedDocumentKey): PrintSlot {
    switch (key.document) {
      case "credit_note":
        return {
          table: "credit_note_receipts",
          column: "credit_note_id",
          value: key.creditNoteId,
        };
      case "deferred_invoice":
        return { table: "deferred_invoice_receipts", column: "sale_id", value: key.saleId };
      case "sale_receipt":
        return { table: "sale_receipts", column: "sale_id", value: key.saleId };
    }
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the outbox has no chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}
