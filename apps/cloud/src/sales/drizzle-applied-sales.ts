import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cashMovements, saleLines, salePayments, sales } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

export async function recordAppliedSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { sale }: Extract<SyncedFact, { kind: "sale_completed" }>,
  appliedAt: Date,
): Promise<void> {
  const { lines, payments, cashMovements: movements, ...header } = sale;
  await tx.insert(sales).values({ ...origin, ...header, appliedAt });
  if (lines.length > 0) {
    await tx.insert(saleLines).values(lines.map((line) => ({ ...line, saleId: sale.id })));
  }
  await tx
    .insert(salePayments)
    .values(payments.map((payment) => ({ ...payment, saleId: sale.id })));
  if (movements.length > 0) {
    await tx.insert(cashMovements).values(
      movements.map((movement) => ({
        ...movement,
        sessionId: sale.sessionId,
        reason: null,
        refType: "sale",
        refId: sale.id,
        authorizedBy: null,
      })),
    );
  }
}
