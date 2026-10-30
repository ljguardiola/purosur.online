import { RETURN_REFUND_ORIGIN, recordedRefundOfCorrection } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cashMovements, paymentRefunds, returnLines, saleReturns } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

export async function recordAppliedReturn<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { registerId, deviceId }: AppliedOrigin,
  { saleReturn }: Extract<SyncedFact, { kind: "sale_returned" }>,
  eventId: string,
): Promise<void> {
  await tx.insert(saleReturns).values({
    id: saleReturn.id,
    saleId: saleReturn.saleId,
    registerId,
    deviceId,
    sessionId: saleReturn.sessionId,
    actorId: saleReturn.actorId,
    authorizedBy: saleReturn.authorizedBy,
    ticketSource: saleReturn.ticketSource,
    occurredAt: saleReturn.occurredAt,
    originEventId: eventId,
  });
  await tx.insert(returnLines).values(
    saleReturn.lines.map(({ productId: _productId, ...line }) => ({
      ...line,
      returnId: saleReturn.id,
    })),
  );
  if (saleReturn.refunds.length > 0) {
    await tx.insert(paymentRefunds).values(
      saleReturn.refunds.map((refund) => ({
        ...recordedRefundOfCorrection(refund, RETURN_REFUND_ORIGIN, {
          actorId: saleReturn.actorId,
          at: saleReturn.occurredAt,
        }),
        saleId: saleReturn.saleId,
        originEventId: eventId,
      })),
    );
  }
  if (saleReturn.cashMovements.length > 0) {
    await tx.insert(cashMovements).values(
      saleReturn.cashMovements.map((movement) => ({
        ...movement,
        sessionId: saleReturn.sessionId,
        reason: null,
        refType: "return",
        refId: saleReturn.id,
        authorizedBy: saleReturn.authorizedBy,
      })),
    );
  }
}
