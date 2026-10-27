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

export function creditNoteIdToPrint(database: LocalDatabase, saleId: string): string | undefined {
  return (
    database
      .prepare<[string], { id: string }>(
        `SELECT notes.id AS id
         FROM sale_void_credit_notes AS notes
         LEFT JOIN credit_note_prints AS prints ON prints.credit_note_id = notes.id
         WHERE notes.sale_id = ?
         ORDER BY (notes.state IN ('AUTHORIZED', 'ISSUED_OFFLINE')) DESC,
                  CASE
                    WHEN prints.print_attempted_at IS NOT NULL AND prints.printed_at IS NULL THEN 0
                    WHEN prints.print_attempted_at IS NULL THEN 1
                    ELSE 2
                  END,
                  CASE WHEN prints.print_attempted_at IS NULL THEN notes.recorded_at END,
                  notes.recorded_at DESC,
                  notes.id
         LIMIT 1`,
      )
      .get(saleId)?.id ?? undefined
  );
}

function printSlotOf(database: LocalDatabase, { document, saleId }: PrintedDocumentKey) {
  switch (document) {
    case "credit_note": {
      const creditNoteId = creditNoteIdToPrint(database, saleId);
      return creditNoteId === undefined
        ? undefined
        : ({ table: "credit_note_prints", column: "credit_note_id", value: creditNoteId } as const);
    }
    case "deferred_invoice":
      return { table: "deferred_invoice_prints", column: "sale_id", value: saleId } as const;
    case "sale_receipt":
      return undefined;
  }
}

function requiredPrintSlot(
  database: LocalDatabase,
  key: PrintedDocumentKey,
): PrintSlot | undefined {
  const slot = printSlotOf(database, key);
  if (slot === undefined && key.document === "credit_note") {
    throw new Error(`sale ${key.saleId} has no credit note`);
  }
  return slot;
}

export function markPrintAttempted(
  database: LocalDatabase,
  key: PrintedDocumentKey,
  at: Date,
): void {
  const slot = requiredPrintSlot(database, key);
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
  const slot = requiredPrintSlot(database, key);
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
      creditNoteContent: (saleId) => this.creditNoteContent(saleId),
      storedReceipt: (key) => this.storedReceipt(key),
      recordStoredReceipt: (key, receipt) => this.recordStoredReceipt(key, receipt),
      recordPrintAttempt: (key, at) => markPrintAttempted(this.database, key, at),
      recordPrinted: (key, at) => markPrinted(this.database, key, at),
      recordReprint: (reprint) => insertReprint(this.database, reprint),
      outboxReady: () => this.outboxChainKey !== undefined,
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
    };
  }

  private receiptDelivery({ document, saleId }: PrintedDocumentKey): ReceiptDelivery | undefined {
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
                EXISTS (SELECT 1 FROM sale_void_credit_notes
                  WHERE sale_void_credit_notes.id = @credit_note_id
                    AND sale_void_credit_notes.state IN ('AUTHORIZED', 'ISSUED_OFFLINE')) AS credit_note_authorized
         FROM sales WHERE id = @sale_id AND state IN ('COMPLETED', 'VOIDED')`,
      )
      .get({
        sale_id: saleId,
        document,
        credit_note_id:
          document === "credit_note" ? (creditNoteIdToPrint(this.database, saleId) ?? null) : null,
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

  private creditNoteContent(saleId: string) {
    const creditNoteId = creditNoteIdToPrint(this.database, saleId);
    const content =
      creditNoteId === undefined ? null : readCreditNoteReceipt(this.database, creditNoteId);
    if (content === null) {
      throw new Error(`sale ${saleId} has no authorized credit note`);
    }
    return content;
  }

  private storedReceipt(key: PrintedDocumentKey): StoredReceipt | undefined {
    const slot = this.storedSlotOf(key);
    if (slot === undefined) {
      return undefined;
    }
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
    if (slot === undefined) {
      throw new Error(`sale ${key.saleId} has no credit note`);
    }
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

  private storedSlotOf({ document, saleId }: PrintedDocumentKey): PrintSlot | undefined {
    switch (document) {
      case "credit_note": {
        const creditNoteId = creditNoteIdToPrint(this.database, saleId);
        return creditNoteId === undefined
          ? undefined
          : { table: "credit_note_receipts", column: "credit_note_id", value: creditNoteId };
      }
      case "deferred_invoice":
        return { table: "deferred_invoice_receipts", column: "sale_id", value: saleId };
      case "sale_receipt":
        return { table: "sale_receipts", column: "sale_id", value: saleId };
    }
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the outbox has no chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}
