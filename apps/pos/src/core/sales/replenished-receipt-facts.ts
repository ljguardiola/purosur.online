import type { PrintedDocumentKey } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import {
  creditNoteIdToPrint,
  insertReprint,
  markPrintAttempted,
  markPrinted,
} from "./sqlite-receipt-ledger";

type ReceiptFact = Extract<SyncedFact, { kind: "sale_print_state_changed" | "reprint_recorded" }>;

interface Printing {
  print_attempted_at: string | null;
  printed_at: string | null;
}

function heldPrintingOf(
  database: LocalDatabase,
  document: PrintedDocumentKey["document"],
  saleId: string,
): Printing | undefined {
  switch (document) {
    case "sale_receipt":
      return database
        .prepare<[string], Printing>(
          "SELECT print_attempted_at, printed_at FROM sales WHERE id = ?",
        )
        .get(saleId);
    case "deferred_invoice":
      return database
        .prepare<[string], Printing>(
          "SELECT print_attempted_at, printed_at FROM deferred_invoice_prints WHERE sale_id = ?",
        )
        .get(saleId);
    case "credit_note":
      return database
        .prepare<[string], Printing>(
          "SELECT print_attempted_at, printed_at FROM credit_note_prints WHERE credit_note_id = ?",
        )
        .get(creditNoteIdToPrint(database, saleId) ?? "");
  }
}

function heldPrinting(database: LocalDatabase, { document, saleId }: PrintedDocumentKey): Printing {
  const sale = database.prepare("SELECT 1 FROM sales WHERE id = ?").get(saleId);
  if (sale === undefined) {
    throw new Error(`sale ${saleId} is not held`);
  }
  const held = heldPrintingOf(database, document, saleId);
  return held ?? { print_attempted_at: null, printed_at: null };
}

function isLater(candidate: Date, held: string | null): boolean {
  return held === null || candidate.getTime() > new Date(held).getTime();
}

export function applyReplenishedReceiptFact(database: LocalDatabase, fact: ReceiptFact): void {
  if (fact.kind === "reprint_recorded") {
    const { reprint } = fact;
    heldPrinting(database, reprint);
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
  const { printAttemptedAt, printedAt, ...key } = fact.printState;
  const held = heldPrinting(database, key);
  if (isLater(printAttemptedAt, held.print_attempted_at)) {
    markPrintAttempted(database, key, printAttemptedAt);
  }
  if (printedAt !== null && isLater(printedAt, held.printed_at)) {
    markPrinted(database, key, printedAt);
  }
}
