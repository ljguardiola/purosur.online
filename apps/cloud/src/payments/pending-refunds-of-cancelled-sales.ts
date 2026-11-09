import { REFUND_PENDING_STATE, REFUND_TASK_ORIGINS } from "@purosur/domain";
import type { PendingRefundOfCancelledSale } from "@purosur/domain/alerts/use-cases";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlertCondition } from "../alerts/open-alert-condition.js";
import { alerts, paymentRefunds, sales } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export function lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert<
  TQueryResult extends PgQueryResultHKT,
>(tx: Transaction<TQueryResult>): Promise<PendingRefundOfCancelledSale[]> {
  return tx
    .select({
      refundId: paymentRefunds.id,
      saleId: paymentRefunds.saleId,
      locationId: sales.locationId,
      origin: paymentRefunds.origin,
      method: paymentRefunds.method,
      amount: paymentRefunds.amount,
      openedAt: paymentRefunds.occurredAt,
      confirmedAt: paymentRefunds.confirmedAt,
      lastRefusalReason: paymentRefunds.lastRefusalReason,
    })
    .from(paymentRefunds)
    .innerJoin(sales, eq(sales.id, paymentRefunds.saleId))
    .where(
      and(
        inArray(paymentRefunds.origin, [...REFUND_TASK_ORIGINS]),
        eq(paymentRefunds.state, REFUND_PENDING_STATE),
        notExists(
          tx
            .select({ id: alerts.id })
            .from(alerts)
            .where(
              and(
                eq(alerts.kind, "refund_task"),
                sql`${alerts.scope} = ${paymentRefunds.id}::text`,
                openAlertCondition(),
              ),
            ),
        ),
      ),
    )
    .for("update", { of: paymentRefunds, skipLocked: true });
}
