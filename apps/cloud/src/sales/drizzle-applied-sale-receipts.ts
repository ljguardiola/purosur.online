import type { PrintedDocument } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { saleReprints, sales } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

function ofTheRegister(saleId: string, { registerId }: AppliedOrigin) {
  return and(eq(sales.id, saleId), eq(sales.registerId, registerId));
}

function notApplied(saleId: string, { registerId }: AppliedOrigin): Error {
  return new Error(`sale ${saleId} is not applied for register ${registerId}`);
}

function printStateColumns(
  document: PrintedDocument,
  attemptedAt: string,
  printedMoment: string | null,
) {
  switch (document) {
    case "credit_note":
      return {
        creditNotePrintAttemptedAt: sql`greatest(${sales.creditNotePrintAttemptedAt}, ${attemptedAt}::timestamptz)`,
        creditNotePrintedAt: sql`greatest(${sales.creditNotePrintedAt}, ${printedMoment}::timestamptz)`,
      };
    case "deferred_invoice":
      return {
        deferredInvoicePrintAttemptedAt: sql`greatest(${sales.deferredInvoicePrintAttemptedAt}, ${attemptedAt}::timestamptz)`,
        deferredInvoicePrintedAt: sql`greatest(${sales.deferredInvoicePrintedAt}, ${printedMoment}::timestamptz)`,
      };
    case "sale_receipt":
      return {
        printAttemptedAt: sql`greatest(${sales.printAttemptedAt}, ${attemptedAt}::timestamptz)`,
        printedAt: sql`greatest(${sales.printedAt}, ${printedMoment}::timestamptz)`,
      };
  }
}

export async function recordAppliedPrintState<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { printState }: Extract<SyncedFact, { kind: "sale_print_state_changed" }>,
): Promise<void> {
  const { saleId, document, printAttemptedAt, printedAt } = printState;
  const attemptedAt = printAttemptedAt.toISOString();
  const printedMoment = printedAt?.toISOString() ?? null;
  const updated = await tx
    .update(sales)
    .set(printStateColumns(document, attemptedAt, printedMoment))
    .where(ofTheRegister(saleId, origin))
    .returning({ id: sales.id });
  if (updated.length === 0) {
    throw notApplied(saleId, origin);
  }
}

export async function recordAppliedReprint<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { reprint }: Extract<SyncedFact, { kind: "reprint_recorded" }>,
): Promise<void> {
  const { reason, ...fields } = reprint;
  const [sale] = await tx
    .select({ id: sales.id })
    .from(sales)
    .where(ofTheRegister(reprint.saleId, origin));
  if (sale === undefined) {
    throw notApplied(reprint.saleId, origin);
  }
  await tx.insert(saleReprints).values({
    ...fields,
    reasonKind: reason.kind,
    reasonText: reason.kind === "requested" ? reason.text : null,
  });
}
