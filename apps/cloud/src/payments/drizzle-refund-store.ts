import { REFUND_DONE_STATE, REFUND_PENDING_STATE } from "@purosur/domain";
import type {
  LockedRefund,
  RefundStore,
  RefundStoreTransaction,
} from "@purosur/domain/payments/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, paymentRefunds, salePayments, sales } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleRefundStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RefundStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockRefund(refundId: string, locationId: string): Promise<LockedRefund | undefined> {
    const [row] = await this.tx
      .select({ id: paymentRefunds.id, state: paymentRefunds.state })
      .from(paymentRefunds)
      .innerJoin(salePayments, eq(salePayments.id, paymentRefunds.paymentId))
      .innerJoin(sales, eq(sales.id, salePayments.saleId))
      .where(and(eq(paymentRefunds.id, refundId), eq(sales.locationId, locationId)))
      .for("update", { of: paymentRefunds });
    return row;
  }

  async recordRefundDone(refundId: string, doneBy: string, doneAt: Date): Promise<void> {
    await this.tx
      .update(paymentRefunds)
      .set({ state: REFUND_DONE_STATE, doneBy, doneAt })
      .where(eq(paymentRefunds.id, refundId));
    await this.tx.insert(auditLog).values({
      entity: "payment_refund",
      entityId: refundId,
      actorId: doneBy,
      previousValue: { state: REFUND_PENDING_STATE },
      newValue: { state: REFUND_DONE_STATE, doneAt: doneAt.toISOString() },
      at: doneAt,
    });
  }
}

export class DrizzleRefundStore<TQueryResult extends PgQueryResultHKT> implements RefundStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: RefundStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRefundStoreTransaction(tx)));
  }
}
