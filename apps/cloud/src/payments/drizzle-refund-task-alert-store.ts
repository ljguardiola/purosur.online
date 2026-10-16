import { type AlertLevel, REFUND_PENDING_STATE, REFUND_TASK_ORIGINS } from "@purosur/domain";
import type {
  PendingRefundOfCancelledSale,
  RefundTaskAlertStore,
  RefundTaskAlertTransaction,
} from "@purosur/domain/payments/use-cases";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { openAlertCondition } from "../alerts/open-alert-condition.js";
import { alerts, paymentRefunds, sales } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleRefundTaskAlertTransaction<TQueryResult extends PgQueryResultHKT>
  implements RefundTaskAlertTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert(): Promise<
    PendingRefundOfCancelledSale[]
  > {
    return this.tx
      .select({
        refundId: paymentRefunds.id,
        saleId: paymentRefunds.saleId,
        locationId: sales.locationId,
        origin: paymentRefunds.origin,
        method: paymentRefunds.method,
        amount: paymentRefunds.amount,
        openedAt: paymentRefunds.occurredAt,
        confirmedAt: paymentRefunds.confirmedAt,
      })
      .from(paymentRefunds)
      .innerJoin(sales, eq(sales.id, paymentRefunds.saleId))
      .where(
        and(
          inArray(paymentRefunds.origin, [...REFUND_TASK_ORIGINS]),
          eq(paymentRefunds.state, REFUND_PENDING_STATE),
          notExists(
            this.tx
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

  async openRefundTaskAlert(
    refund: PendingRefundOfCancelledSale,
    level: AlertLevel,
    openedAt: Date,
  ): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "refund_task",
        scope: refund.refundId,
        locationId: refund.locationId,
        detail: {
          saleId: refund.saleId,
          amount: refund.amount,
          method: refund.method,
          refundOpenedAt: refund.openedAt.toISOString(),
        },
      },
      { now: () => openedAt, level },
    );
  }
}

export class DrizzleRefundTaskAlertStore<TQueryResult extends PgQueryResultHKT>
  implements RefundTaskAlertStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: RefundTaskAlertTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRefundTaskAlertTransaction(tx)));
  }
}
