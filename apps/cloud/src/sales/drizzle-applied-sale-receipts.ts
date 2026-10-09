import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { saleReprints, sales } from "../platform/db/schema.js";

export async function recordAppliedPrintState<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { printState }: Extract<SyncedFact, { kind: "sale_print_state_changed" }>,
): Promise<void> {
  const { saleId, printAttemptedAt, printedAt } = printState;
  const updated = await tx
    .update(sales)
    .set({
      printAttemptedAt: sql`greatest(${sales.printAttemptedAt}, ${printAttemptedAt.toISOString()}::timestamptz)`,
      printedAt: sql`greatest(${sales.printedAt}, ${printedAt?.toISOString() ?? null}::timestamptz)`,
    })
    .where(eq(sales.id, saleId))
    .returning({ id: sales.id });
  if (updated.length === 0) {
    throw new Error(`sale ${saleId} is not applied`);
  }
}

export async function recordAppliedReprint<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { reprint }: Extract<SyncedFact, { kind: "reprint_recorded" }>,
): Promise<void> {
  const { reason, ...fields } = reprint;
  await tx.insert(saleReprints).values({
    ...fields,
    reasonKind: reason.kind,
    reasonText: reason.kind === "requested" ? reason.text : null,
  });
}
