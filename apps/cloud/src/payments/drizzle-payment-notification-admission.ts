import type {
  PaymentNotificationAdmission,
  PaymentNotificationAdmissionTransaction,
} from "@purosur/domain/payments/use-cases";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentNotificationAttempts } from "../platform/db/schema.js";

const PRUNE_BATCH_SIZE = 100;

class DrizzlePaymentNotificationAdmissionTransaction<TQueryResult extends PgQueryResultHKT>
  implements PaymentNotificationAdmissionTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  // An origin has no row of its own to lock before its first notification, so each one takes a
  // transaction-scoped advisory lock, prefixed so no other limiter ever waits on it.
  async lockNotificationAttempts(sourceAddress: string): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`payment_notification:${sourceAddress}`}, 0))`,
    );
  }

  async forgetNotificationsOutsideWindow(windowStart: Date): Promise<void> {
    const expired = this.tx
      .select({ id: paymentNotificationAttempts.id })
      .from(paymentNotificationAttempts)
      .where(lte(paymentNotificationAttempts.attemptedAt, windowStart))
      .limit(PRUNE_BATCH_SIZE)
      .for("update", { skipLocked: true });
    await this.tx
      .delete(paymentNotificationAttempts)
      .where(inArray(paymentNotificationAttempts.id, expired));
  }

  async admittedNotifications(sourceAddress: string, since: Date): Promise<Date[]> {
    const rows = await this.tx
      .select({ attemptedAt: paymentNotificationAttempts.attemptedAt })
      .from(paymentNotificationAttempts)
      .where(
        and(
          eq(paymentNotificationAttempts.sourceAddress, sourceAddress),
          gt(paymentNotificationAttempts.attemptedAt, since),
        ),
      );
    return rows.map((row) => row.attemptedAt);
  }

  async recordAdmittedNotification(sourceAddress: string, at: Date): Promise<void> {
    await this.tx.insert(paymentNotificationAttempts).values({ sourceAddress, attemptedAt: at });
  }
}

export class DrizzlePaymentNotificationAdmission<TQueryResult extends PgQueryResultHKT>
  implements PaymentNotificationAdmission
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: PaymentNotificationAdmissionTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzlePaymentNotificationAdmissionTransaction(tx)),
    );
  }
}
