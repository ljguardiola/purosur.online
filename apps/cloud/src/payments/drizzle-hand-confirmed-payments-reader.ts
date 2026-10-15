import {
  APPROVED_PAYMENT_STATE,
  ARGENTINA_TIME_ZONE,
  CONFIRMED_BY_HAND_METHODS,
  type HandConfirmedPayment,
  isConfirmedByHand,
} from "@purosur/domain";
import type {
  HandConfirmedPaymentsQuery,
  HandConfirmedPaymentsReader,
} from "@purosur/domain/payments/use-cases";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { salePayments, sales, users } from "../platform/db/schema.js";

const confirmationDay = sql<string>`to_char(${salePayments.confirmedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleHandConfirmedPaymentsReader<TQueryResult extends PgQueryResultHKT>
  implements HandConfirmedPaymentsReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async handConfirmedPayments({
    locationId,
    period,
    registerId,
    method,
  }: HandConfirmedPaymentsQuery): Promise<HandConfirmedPayment[]> {
    const cashiers = alias(users, "cashiers");
    const confirmers = alias(users, "confirmers");
    const rows = await this.db
      .select({
        id: salePayments.id,
        method: salePayments.method,
        amount: salePayments.amount,
        confirmedAt: salePayments.confirmedAt,
        authorizedBy: salePayments.authorizedBy,
        cashierId: sales.actorId,
        cashierName: cashiers.firstName,
        confirmedByName: confirmers.firstName,
        saleOperationNumber: sales.operationNumber,
      })
      .from(salePayments)
      .innerJoin(sales, eq(sales.id, salePayments.saleId))
      .leftJoin(cashiers, sql`${cashiers.id}::text = ${sales.actorId}`)
      .leftJoin(confirmers, sql`${confirmers.id}::text = ${salePayments.authorizedBy}`)
      .where(
        and(
          eq(sales.locationId, locationId),
          eq(salePayments.state, APPROVED_PAYMENT_STATE),
          inArray(salePayments.method, CONFIRMED_BY_HAND_METHODS),
          registerId === undefined ? undefined : eq(sales.registerId, registerId),
          method === undefined ? undefined : eq(salePayments.method, method),
          sql`${confirmationDay} >= ${period.from}`,
          sql`${confirmationDay} <= ${period.to}`,
        ),
      )
      .orderBy(desc(salePayments.confirmedAt));

    return rows.map((row) => {
      if (!isConfirmedByHand(row) || row.authorizedBy === null || row.confirmedAt === null) {
        throw new Error(`The payment ${row.id} does not say who confirmed it`);
      }
      return {
        id: row.id,
        method: row.method,
        amount: row.amount,
        confirmedAt: row.confirmedAt,
        cashierId: row.cashierId,
        cashierName: row.cashierName,
        confirmedById: row.authorizedBy,
        confirmedByName: row.confirmedByName,
        saleOperationNumber: row.saleOperationNumber,
      };
    });
  }
}
