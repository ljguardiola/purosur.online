import type {
  LatePaymentRefund,
  MercadoPagoPaymentMethod,
  PaymentTransactionState,
} from "@purosur/domain";
import {
  applyMercadoPagoPaymentReplacement,
  type LatePaymentRefundOpening,
  type MercadoPagoPaymentReplacement,
  type MercadoPagoPaymentReplacementStore,
  type MercadoPagoPaymentReplacementTransaction,
  type ReplacedMercadoPagoPayment,
} from "@purosur/domain/payments/use-cases";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentTransactions } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";
import { openLatePaymentRefund } from "./open-late-payment-refund.js";

class DrizzleMercadoPagoPaymentReplacementTransaction<TQueryResult extends PgQueryResultHKT>
  implements MercadoPagoPaymentReplacementTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async markReplaced({
    registerId,
    paymentTransactionId,
    saleId,
  }: MercadoPagoPaymentReplacement): Promise<ReplacedMercadoPagoPayment | null> {
    const [row] = await this.tx
      .update(paymentTransactions)
      .set({ replaced: true })
      .where(
        and(
          eq(paymentTransactions.id, paymentTransactionId),
          eq(paymentTransactions.registerId, registerId),
          eq(paymentTransactions.saleId, saleId),
        ),
      )
      .returning({
        id: paymentTransactions.id,
        method: paymentTransactions.method,
        provider: paymentTransactions.provider,
        amount: paymentTransactions.amount,
        state: paymentTransactions.state,
        replaced: paymentTransactions.replaced,
      });
    if (!row) {
      return null;
    }
    return {
      ...row,
      method: row.method as MercadoPagoPaymentMethod,
      state: row.state as PaymentTransactionState,
    };
  }

  openLatePaymentRefund(
    refund: LatePaymentRefund,
    openedAt: Date,
  ): Promise<LatePaymentRefundOpening> {
    return openLatePaymentRefund(this.tx, refund, openedAt);
  }
}

class DrizzleMercadoPagoPaymentReplacementStore<TQueryResult extends PgQueryResultHKT>
  implements MercadoPagoPaymentReplacementStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  inOneTransaction<TOutcome>(
    work: (tx: MercadoPagoPaymentReplacementTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleMercadoPagoPaymentReplacementTransaction(tx)),
    );
  }
}

export async function recordAppliedMercadoPagoPaymentReplacement<
  TQueryResult extends PgQueryResultHKT,
>(
  tx: PgDatabase<TQueryResult>,
  { registerId }: AppliedOrigin,
  { replacement }: Extract<SyncedFact, { kind: "mercado_pago_payment_replaced" }>,
  appliedAt: Date,
): Promise<void> {
  const outcome = await applyMercadoPagoPaymentReplacement(
    { store: new DrizzleMercadoPagoPaymentReplacementStore(tx), clock: { now: () => appliedAt } },
    {
      registerId,
      paymentTransactionId: replacement.paymentTransactionId,
      saleId: replacement.saleId,
    },
  );
  if (outcome.kind === "not_recorded") {
    throw new Error(
      `payment transaction ${replacement.paymentTransactionId} is not recorded for register ${registerId} and sale ${replacement.saleId}`,
    );
  }
}
