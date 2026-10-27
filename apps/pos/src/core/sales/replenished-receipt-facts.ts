import type { PrintedDocumentKey } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { insertReprint, markPrintAttempted, markPrinted } from "./sqlite-receipt-ledger";

type ReceiptFact = Extract<SyncedFact, { kind: "sale_print_state_changed" | "reprint_recorded" }>;

type SalePrintState = Extract<ReceiptFact, { kind: "sale_print_state_changed" }>["printState"];

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
  const held = database
    .prepare<[string], { id: string }>("SELECT id FROM sale_credit_notes WHERE sale_id = ?")
    .all(saleId)
    .map(({ id }) => id);
  if (named === null) {
    const [only] = held;
    if (only === undefined || held.length > 1) {
      throw new Error(`sale ${saleId} holds ${held.length} credit notes and the print names none`);
    }
    return only;
  }
  if (!held.includes(named)) {
    throw new Error(`credit note ${named} is not held by sale ${saleId}`);
  }
  return named;
}

function keyOf(database: LocalDatabase, printState: SalePrintState): PrintedDocumentKey {
  requireHeldSale(database, printState.saleId);
  return printState.document === "credit_note"
    ? {
        document: "credit_note",
        saleId: printState.saleId,
        creditNoteId: heldCreditNoteId(database, printState.saleId, printState.creditNoteId),
      }
    : { document: printState.document, saleId: printState.saleId };
}

function isLater(candidate: Date, held: string | null): boolean {
  return held === null || candidate.getTime() > new Date(held).getTime();
}

export function applyReplenishedReceiptFact(database: LocalDatabase, fact: ReceiptFact): void {
  if (fact.kind === "reprint_recorded") {
    const { reprint } = fact;
    requireHeldSale(database, reprint.saleId);
    const held = database
      .prepare(
        "SELECT 1 FROM sale_reprints WHERE sale_id = ? AND document = ? AND order_number = ?",
      )
      .get(reprint.saleId, reprint.document, reprint.orderNumber);
    if (held === undefined) {
      insertReprint(database, reprint);
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
