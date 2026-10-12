import type {
  LatePaymentRefund,
  MercadoPagoQrOrderTransaction,
  PaymentTransactionState,
} from "@purosur/domain";
import {
  type LatePaymentRefundOpening,
  PaymentTransactionAlreadyRecorded,
  type PaymentTransactionLane,
  type PaymentTransactionLanes,
  type PaymentTransactionOutcome,
  type PaymentTransactionReading,
  type RecordedOrderState,
} from "@purosur/domain/payments/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { paymentTransactions } from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { openLatePaymentRefund } from "./open-late-payment-refund.js";

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
  ): Promise<MercadoPagoQrOrderTransaction | null> {
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
      creationOutcomeUnknown: row.creationOutcomeUnknown,
      replaced: row.replaced,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }

  async recordPendingTransaction(transaction: MercadoPagoQrOrderTransaction): Promise<void> {
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

  async recordCreationAttempt(paymentTransactionId: string, expiresAt: Date): Promise<void> {
    await this.db
      .update(paymentTransactions)
      .set({ expiresAt, creationOutcomeUnknown: true })
      .where(eq(paymentTransactions.id, paymentTransactionId));
  }

  async recordCreationCreatedNothing(paymentTransactionId: string): Promise<void> {
    await this.db
      .update(paymentTransactions)
      .set({ creationOutcomeUnknown: false })
      .where(eq(paymentTransactions.id, paymentTransactionId));
  }

  async recordNeedsReview(paymentTransactionId: string): Promise<void> {
    await this.db
      .update(paymentTransactions)
      .set({ needsReview: true })
      .where(eq(paymentTransactions.id, paymentTransactionId));
  }

  async recordExpired(paymentTransactionId: string): Promise<void> {
    await this.db
      .update(paymentTransactions)
      .set({ state: "EXPIRED" })
      .where(eq(paymentTransactions.id, paymentTransactionId));
  }

  async recordOrderCreated(
    paymentTransactionId: string,
    providerOrderId: string,
    reading: PaymentTransactionReading | null,
  ): Promise<RecordedOrderState> {
    return this.recordedOrderState(
      paymentTransactionId,
      reading === null
        ? { providerOrderId }
        : {
            providerOrderId,
            state: reading.outcome.state,
            needsReview: reading.outcome.needsReview,
            stateReadAt: reading.readAt,
          },
    );
  }

  async recordNoOtherOrderPossible(paymentTransactionId: string): Promise<void> {
    await this.db
      .update(paymentTransactions)
      .set({ creationOutcomeUnknown: false })
      .where(eq(paymentTransactions.id, paymentTransactionId));
  }

  async recordOrderResult(
    paymentTransactionId: string,
    { state, needsReview }: PaymentTransactionOutcome,
    readAt: Date,
  ): Promise<RecordedOrderState> {
    return this.recordedOrderState(paymentTransactionId, {
      state,
      needsReview,
      stateReadAt: readAt,
    });
  }

  openLatePaymentRefund(
    refund: LatePaymentRefund,
    openedAt: Date,
  ): Promise<LatePaymentRefundOpening> {
    return openLatePaymentRefund(this.db, refund, openedAt);
  }

  inOneTransaction<TOutcome>(
    work: (lane: PaymentTransactionLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzlePaymentTransactionLane(tx)));
  }

  private async recordedOrderState(
    paymentTransactionId: string,
    changes: Partial<typeof paymentTransactions.$inferInsert>,
  ): Promise<RecordedOrderState> {
    const [row] = await this.db
      .update(paymentTransactions)
      .set(changes)
      .where(eq(paymentTransactions.id, paymentTransactionId))
      .returning({ state: paymentTransactions.state, replaced: paymentTransactions.replaced });
    if (!row) {
      throw new Error(`payment transaction ${paymentTransactionId} is not recorded`);
    }
    return { state: row.state as PaymentTransactionState, replaced: row.replaced };
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
