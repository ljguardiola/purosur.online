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

export async function recordAppliedPrintState<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { printState }: Extract<SyncedFact, { kind: "sale_print_state_changed" }>,
): Promise<void> {
  const { saleId, printAttemptedAt, printedAt } = printState;
  const updated = await tx
    .update(sales)
    .set({
      printAttemptedAt: sql`greatest(${sales.printAttemptedAt}, ${printAttemptedAt.toISOString()}::timestamptz)`,
      printedAt: sql`greatest(${sales.printedAt}, ${printedAt?.toISOString() ?? null}::timestamptz)`,
    })
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
