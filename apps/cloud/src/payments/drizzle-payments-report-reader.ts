import {
  APPROVED_PAYMENT_STATE,
  ARGENTINA_TIME_ZONE,
  PAYMENT_METHODS,
  SALES_REPORT_SALE_STATE,
} from "@purosur/domain";
import type {
  ApprovedPaymentsByMethod,
  ApprovedPaymentsQuery,
  PaymentsReportReader,
  SalesPaidByMethod,
} from "@purosur/domain/payments/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { salePayments, sales } from "../platform/db/schema.js";

const saleDay = sql<string>`to_char(${sales.completedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

function paymentMethodOf(stored: string): SalesPaidByMethod["method"] {
  const method = PAYMENT_METHODS.find((known) => known === stored);
  if (method === undefined) {
    throw new Error(`A stored payment has an unknown method: ${stored}`);
  }
  return method;
}

export class DrizzlePaymentsReportReader<TQueryResult extends PgQueryResultHKT>
  implements PaymentsReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async approvedPaymentsByMethod({
    locationId,
    period,
    registerId,
  }: ApprovedPaymentsQuery): Promise<ApprovedPaymentsByMethod> {
    const rows = await this.db
      .select({
        method: salePayments.method,
        salesCount: sql<number>`count(distinct ${salePayments.saleId})`.mapWith(Number),
        amount: sql<number>`coalesce(sum(${salePayments.amount}), 0)`.mapWith(Number),
      })
      .from(salePayments)
      .innerJoin(sales, eq(sales.id, salePayments.saleId))
      .where(
        and(
          eq(sales.locationId, locationId),
          eq(sales.state, SALES_REPORT_SALE_STATE),
          eq(salePayments.state, APPROVED_PAYMENT_STATE),
          registerId === undefined ? undefined : eq(sales.registerId, registerId),
          sql`${saleDay} >= ${period.from}`,
          sql`${saleDay} <= ${period.to}`,
        ),
      )
      .groupBy(sql`grouping sets ((${salePayments.method}), ())`);

    const methods: SalesPaidByMethod[] = [];
    let salesCount = 0;
    let total = 0;
    for (const row of rows) {
      if (row.method === null) {
        salesCount = row.salesCount;
        total = row.amount;
      } else {
        methods.push({
          method: paymentMethodOf(row.method),
          salesCount: row.salesCount,
          amount: row.amount,
        });
      }
    }
    return { methods, salesCount, total };
  }
}
