import type { AlertLevel } from "@purosur/domain";
import type {
  PendingRefundOfCancelledSale,
  RefundTaskAlertStore,
  RefundTaskAlertTransaction,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert } from "../payments/pending-refunds-of-cancelled-sales.js";
import { openAlert } from "./open-alert.js";

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

  lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert(): Promise<
    PendingRefundOfCancelledSale[]
  > {
    return lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert(this.tx);
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
