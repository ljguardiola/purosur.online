import type { PrintedDocumentKey } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { insertReprint, markPrintAttempted, markPrinted } from "./sqlite-receipt-ledger";

type ReceiptFact = Extract<SyncedFact, { kind: "sale_print_state_changed" | "reprint_recorded" }>;

type SalePrintState = Extract<ReceiptFact, { kind: "sale_print_state_changed" }>["printState"];

type SaleReprint = Extract<ReceiptFact, { kind: "reprint_recorded" }>["reprint"];

interface Printing {
  print_attempted_at: string | null;
  printed_at: string | null;
}

function heldPrintingOf(database: LocalDatabase, key: PrintedDocumentKey): Printing | undefined {
  switch (key.document) {
    case "sale_receipt":
      return database
        .prepare<[string], Printing>(
          "SELECT print_attempted_at, printed_at FROM sales WHERE id = ?",
        )
        .get(key.saleId);
    case "deferred_invoice":
      return database
        .prepare<[string], Printing>(
          "SELECT print_attempted_at, printed_at FROM deferred_invoice_prints WHERE sale_id = ?",
        )
        .get(key.saleId);
    case "credit_note":
      return database
        .prepare<[string], Printing>(
          "SELECT print_attempted_at, printed_at FROM credit_note_prints WHERE credit_note_id = ?",
        )
        .get(key.creditNoteId);
  }
}

function requireHeldSale(database: LocalDatabase, saleId: string): void {
  const sale = database.prepare("SELECT 1 FROM sales WHERE id = ?").get(saleId);
  if (sale === undefined) {
    throw new Error(`sale ${saleId} is not held`);
  }
}

function heldCreditNoteId(database: LocalDatabase, saleId: string, named: string | null): string {
  if (named === null) {
    const ofVoid = database
      .prepare<[string], { id: string }>(
        "SELECT id FROM sale_credit_notes WHERE sale_id = ? AND return_id IS NULL",
      )
      .get(saleId);
    if (ofVoid === undefined) {
      throw new Error(`sale ${saleId} holds no credit note of its void and the event names none`);
    }
    return ofVoid.id;
  }
  const held = database
    .prepare<[string, string], { id: string }>(
      "SELECT id FROM sale_credit_notes WHERE sale_id = ? AND id = ?",
    )
    .get(saleId, named);
  if (held === undefined) {
    throw new Error(`credit note ${named} is not held by sale ${saleId}`);
  }
  return named;
}

function keyOf(database: LocalDatabase, named: SalePrintState | SaleReprint): PrintedDocumentKey {
  requireHeldSale(database, named.saleId);
  return named.document === "credit_note"
    ? {
        document: "credit_note",
        saleId: named.saleId,
        creditNoteId: heldCreditNoteId(database, named.saleId, named.creditNoteId),
      }
    : { document: named.document, saleId: named.saleId };
}

function isLater(candidate: Date, held: string | null): boolean {
  return held === null || candidate.getTime() > new Date(held).getTime();
}

export function heldSaleReceiptAttempt(database: LocalDatabase, saleId: string): Date | null {
  const attempted = heldPrintingOf(database, {
    document: "sale_receipt",
    saleId,
  })?.print_attempted_at;
  return attempted === null || attempted === undefined ? null : new Date(attempted);
}

export function holdSaleReceiptAttempt(database: LocalDatabase, saleId: string, at: Date): void {
  markPrintAttempted(database, { document: "sale_receipt", saleId }, at);
}

export function applyReplenishedReceiptFact(database: LocalDatabase, fact: ReceiptFact): void {
  if (fact.kind === "reprint_recorded") {
    const { reprint } = fact;
    const key = keyOf(database, reprint);
    const held = database
      .prepare(
        "SELECT 1 FROM sale_reprints WHERE sale_id = ? AND document = ? AND credit_note_id IS ? AND order_number = ?",
      )
      .get(
        reprint.saleId,
        reprint.document,
        key.document === "credit_note" ? key.creditNoteId : null,
        reprint.orderNumber,
      );
    if (held === undefined) {
      insertReprint(
        database,
        key.document === "credit_note"
          ? { ...reprint, document: "credit_note", creditNoteId: key.creditNoteId }
          : { ...reprint, document: key.document },
      );
    }
    return;
  }
  const { printAttemptedAt, printedAt } = fact.printState;
  const key = keyOf(database, fact.printState);
  const held = heldPrintingOf(database, key) ?? { print_attempted_at: null, printed_at: null };
  if (isLater(printAttemptedAt, held.print_attempted_at)) {
    markPrintAttempted(database, key, printAttemptedAt);
  }
  if (printedAt !== null && isLater(printedAt, held.printed_at)) {
    markPrinted(database, key, printedAt);
  }
}
