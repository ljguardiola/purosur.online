import type { PrintedDocumentKey } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { insertReprint, markPrintAttempted, markPrinted } from "./sqlite-receipt-ledger";

type ReceiptFact = Extract<SyncedFact, { kind: "sale_print_state_changed" | "reprint_recorded" }>;

interface Printing {
  print_attempted_at: string | null;
  printed_at: string | null;
}

function heldPrinting(database: LocalDatabase, { document, saleId }: PrintedDocumentKey): Printing {
  const sale = database.prepare("SELECT 1 FROM sales WHERE id = ?").get(saleId);
  if (sale === undefined) {
    throw new Error(`sale ${saleId} is not held`);
  }
  const table = document === "credit_note" ? "credit_note_prints" : "sales";
  const key = document === "credit_note" ? "sale_id" : "id";
  const held = database
    .prepare<[string], Printing>(
      `SELECT print_attempted_at, printed_at FROM ${table} WHERE ${key} = ?`,
    )
    .get(saleId);
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
