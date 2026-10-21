import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { insertReprint, markPrintAttempted, markPrinted } from "./sqlite-receipt-ledger";

type ReceiptFact = Extract<SyncedFact, { kind: "sale_print_state_changed" | "reprint_recorded" }>;

interface Printing {
  print_attempted_at: string | null;
  printed_at: string | null;
}

function heldPrinting(database: LocalDatabase, saleId: string): Printing {
  const held = database
    .prepare<[string], Printing>("SELECT print_attempted_at, printed_at FROM sales WHERE id = ?")
    .get(saleId);
  if (held === undefined) {
    throw new Error(`sale ${saleId} is not held`);
  }
  return held;
}

function isLater(candidate: Date, held: string | null): boolean {
  return held === null || candidate.getTime() > new Date(held).getTime();
}

export function applyReplenishedReceiptFact(database: LocalDatabase, fact: ReceiptFact): void {
  if (fact.kind === "reprint_recorded") {
    const { reprint } = fact;
    heldPrinting(database, reprint.saleId);
    const held = database
      .prepare("SELECT 1 FROM sale_reprints WHERE sale_id = ? AND order_number = ?")
      .get(reprint.saleId, reprint.orderNumber);
    if (held === undefined) {
      insertReprint(database, reprint);
    }
    return;
  }
  const { saleId, printAttemptedAt, printedAt } = fact.printState;
  const held = heldPrinting(database, saleId);
  if (isLater(printAttemptedAt, held.print_attempted_at)) {
    markPrintAttempted(database, saleId, printAttemptedAt);
  }
  if (printedAt !== null && isLater(printedAt, held.printed_at)) {
    markPrinted(database, saleId, printedAt);
  }
}
