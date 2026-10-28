import {
  APPROVED_PAYMENT_STATE,
  DEFAULT_GOOD_CONDITION_RETURN_DAYS,
  REFUND_DISCARDED_STATE,
  type SaleReturnHistory,
} from "@purosur/domain";
import { and, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  branchSettings,
  paymentRefunds,
  returnLines,
  saleLines,
  salePayments,
  sales,
} from "../platform/db/schema.js";

export async function saleReturnHistory<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  saleId: string,
  locationId: string,
): Promise<SaleReturnHistory | undefined> {
  const [sale] = await tx
    .select({
      completedAt: sales.completedAt,
      goodConditionReturnDays: branchSettings.goodConditionReturnDays,
    })
    .from(sales)
    .leftJoin(branchSettings, eq(branchSettings.locationId, sales.locationId))
    .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));
  if (!sale?.completedAt) {
    return undefined;
  }
  const lines = await tx
    .select({
      saleLineId: saleLines.id,
      soldQuantity: saleLines.quantity,
      returnedQuantity: sql<number>`coalesce(sum(${returnLines.quantity}), 0)::int`,
    })
    .from(saleLines)
    .leftJoin(returnLines, eq(returnLines.saleLineId, saleLines.id))
    .where(eq(saleLines.saleId, saleId))
    .groupBy(saleLines.id, saleLines.quantity);
  const payments = await tx
    .select({
      paymentId: salePayments.id,
      amount: salePayments.amount,
      refundedAmount: sql<number>`coalesce(sum(${paymentRefunds.amount}), 0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(salePayments)
    .leftJoin(
      paymentRefunds,
      and(
        eq(paymentRefunds.paymentId, salePayments.id),
        ne(paymentRefunds.state, REFUND_DISCARDED_STATE),
      ),
    )
    .where(and(eq(salePayments.saleId, saleId), eq(salePayments.state, APPROVED_PAYMENT_STATE)))
    .groupBy(salePayments.id, salePayments.amount);
  return {
    saleOccurredAt: sale.completedAt,
    goodConditionReturnDays: sale.goodConditionReturnDays ?? DEFAULT_GOOD_CONDITION_RETURN_DAYS,
    lines,
    payments,
  };
}
