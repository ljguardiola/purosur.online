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

export function markPrintAttempted(
  database: LocalDatabase,
  key: PrintedDocumentKey,
  at: Date,
): void {
  if (key.document === "credit_note") {
    database
      .prepare(
        `INSERT INTO credit_note_prints (sale_id, print_attempted_at) VALUES (?, ?)
         ON CONFLICT (sale_id) DO UPDATE SET print_attempted_at = excluded.print_attempted_at`,
      )
      .run(key.saleId, at.toISOString());
    return;
  }
  database
    .prepare("UPDATE sales SET print_attempted_at = ? WHERE id = ?")
    .run(at.toISOString(), key.saleId);
}

export function markPrinted(database: LocalDatabase, key: PrintedDocumentKey, at: Date): void {
  if (key.document === "credit_note") {
    database
      .prepare("UPDATE credit_note_prints SET printed_at = ? WHERE sale_id = ?")
      .run(at.toISOString(), key.saleId);
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
      .prepare<{ sale_id: string; document: string }, DeliveryRow>(
        `SELECT CASE WHEN @document = 'credit_note'
                  THEN (SELECT print_attempted_at FROM credit_note_prints WHERE sale_id = sales.id)
                  ELSE print_attempted_at END AS print_attempted_at,
                CASE WHEN @document = 'credit_note'
                  THEN (SELECT printed_at FROM credit_note_prints WHERE sale_id = sales.id)
                  ELSE printed_at END AS printed_at,
                (SELECT count(*) FROM sale_reprints
                  WHERE sale_reprints.sale_id = sales.id AND sale_reprints.document = @document) AS reprint_count,
                (state = 'VOIDED') AS voided,
                EXISTS (SELECT 1 FROM sale_void_credit_notes
                  WHERE sale_void_credit_notes.sale_id = sales.id
                    AND sale_void_credit_notes.state = 'AUTHORIZED') AS credit_note_authorized
         FROM sales WHERE id = @sale_id AND state IN ('COMPLETED', 'VOIDED')`,
      )
      .get({ sale_id: saleId, document });
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
    const content = readCreditNoteReceipt(this.database, saleId);
    if (content === null) {
      throw new Error(`sale ${saleId} has no authorized credit note`);
    }
    return content;
  }

  private storedReceipt({ document, saleId }: PrintedDocumentKey): StoredReceipt | undefined {
    const row = this.database
      .prepare<[string], StoredReceiptRow>(
        `SELECT template_version, head, body FROM ${storedTableOf(document)} WHERE sale_id = ?`,
      )
      .get(saleId);
    return row === undefined
      ? undefined
      : {
          templateVersion: row.template_version,
          head: new Uint8Array(row.head),
          body: new Uint8Array(row.body),
        };
  }

  private recordStoredReceipt(
    { document, saleId }: PrintedDocumentKey,
    receipt: StoredReceipt,
  ): void {
    this.database
      .prepare(
        `INSERT INTO ${storedTableOf(document)} (sale_id, template_version, head, body)
         VALUES (@sale_id, @template_version, @head, @body)`,
      )
      .run({
        sale_id: saleId,
        template_version: receipt.templateVersion,
        head: Buffer.from(receipt.head),
        body: Buffer.from(receipt.body),
      });
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the outbox has no chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}

function storedTableOf(document: PrintedDocumentKey["document"]): string {
  return document === "credit_note" ? "credit_note_receipts" : "sale_receipts";
}
