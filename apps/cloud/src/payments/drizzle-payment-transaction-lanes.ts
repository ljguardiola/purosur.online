import type { PaymentTransactionState, ProviderPaymentTransaction } from "@purosur/domain";
import {
  PaymentTransactionAlreadyRecorded,
  type PaymentTransactionLane,
  type PaymentTransactionLanes,
  type PaymentTransactionOutcome,
} from "@purosur/domain/payments/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { paymentTransactions } from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";

const UNIQUE_VIOLATION = "23505";
const PAYMENT_TRANSACTIONS_PRIMARY_KEY = "payment_transactions_pkey";

function paymentTransactionLockKey(paymentTransactionId: string): string {
  return `payment_transaction:${paymentTransactionId}`;
}

class DrizzlePaymentTransactionLane<TQueryResult extends PgQueryResultHKT>
  implements PaymentTransactionLane
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async recordedTransaction(
    registerId: string,
    paymentTransactionId: string,
  ): Promise<ProviderPaymentTransaction | null> {
    const [row] = await this.db
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.id, paymentTransactionId),
          eq(paymentTransactions.registerId, registerId),
        ),
      );
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      registerId: row.registerId,
      saleId: row.saleId,
      kind: "SALE",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      amount: row.amount,
      state: row.state as PaymentTransactionState,
      needsReview: row.needsReview,
      providerOrderId: row.providerOrderId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }

  async recordPendingTransaction(transaction: ProviderPaymentTransaction): Promise<void> {
    try {
      await this.db.insert(paymentTransactions).values(transaction);
    } catch (error) {
      if (
        postgresErrorChain(error).some(
          (link) =>
            link.code === UNIQUE_VIOLATION && link.constraint === PAYMENT_TRANSACTIONS_PRIMARY_KEY,
        )
      ) {
        throw new PaymentTransactionAlreadyRecorded();
      }
      throw error;
    }
  }

  async recordOrderCreated(paymentTransactionId: string, providerOrderId: string): Promise<void> {
    await this.db
      .update(paymentTransactions)
      .set({ providerOrderId })
      .where(eq(paymentTransactions.id, paymentTransactionId));
  }

  async recordOrderResult(
    paymentTransactionId: string,
    { state, needsReview }: PaymentTransactionOutcome,
    readAt: Date,
  ): Promise<void> {
    await this.db
      .update(paymentTransactions)
      .set({ state, needsReview, stateReadAt: readAt })
      .where(eq(paymentTransactions.id, paymentTransactionId));
  }
}

export class DrizzlePaymentTransactionLanes<TQueryResult extends PgQueryResultHKT>
  implements PaymentTransactionLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;

  constructor(connections: DedicatedConnections<TQueryResult>) {
    this.connections = connections;
  }

  inPaymentTransactionLane<TOutcome>(
    paymentTransactionId: string,
    work: (lane: PaymentTransactionLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.connections.withConnection(async (db) => {
      const key = sql`hashtextextended(${paymentTransactionLockKey(paymentTransactionId)}, 0)`;
      await db.execute(sql`select pg_advisory_lock(${key})`);
      try {
        return await work(new DrizzlePaymentTransactionLane(db));
      } finally {
        await db.execute(sql`select pg_advisory_unlock(${key})`);
      }
    });
  }
}
