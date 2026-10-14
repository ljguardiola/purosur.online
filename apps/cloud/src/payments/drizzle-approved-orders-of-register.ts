import {
  MERCADO_PAGO_PAYMENT_METHODS,
  MERCADO_PAGO_PROVIDERS,
  PAID_ORDER_PAYMENT_STATE,
  PAID_ORDER_REPLACED,
} from "@purosur/domain";
import type {
  ApprovedOrderOfRegister,
  ApprovedOrdersOfRegister,
} from "@purosur/domain/payments/use-cases";
import { and, asc, eq, gte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentTransactions } from "../platform/db/schema.js";

function known<TKnown extends string>(
  options: readonly TKnown[],
  stored: string,
  what: string,
): TKnown {
  const found = options.find((option) => option === stored);
  if (found === undefined) {
    throw new Error(`A stored payment transaction has an unknown ${what}: ${stored}`);
  }
  return found;
}

export class DrizzleApprovedOrdersOfRegister<TQueryResult extends PgQueryResultHKT>
  implements ApprovedOrdersOfRegister
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async approvedUnreplacedSince(
    registerId: string,
    since: Date,
  ): Promise<ApprovedOrderOfRegister[]> {
    const rows = await this.db
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.registerId, registerId),
          eq(paymentTransactions.state, PAID_ORDER_PAYMENT_STATE),
          eq(paymentTransactions.replaced, PAID_ORDER_REPLACED),
          gte(paymentTransactions.createdAt, since),
        ),
      )
      .orderBy(asc(paymentTransactions.createdAt));
    return rows.map((row) => ({
      paymentTransactionId: row.id,
      saleId: row.saleId,
      method: known(MERCADO_PAGO_PAYMENT_METHODS, row.method, "method"),
      provider: known(MERCADO_PAGO_PROVIDERS, row.provider, "provider"),
      amount: row.amount,
      createdAt: row.createdAt,
    }));
  }
}
