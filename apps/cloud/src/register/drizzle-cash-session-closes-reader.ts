import { ARGENTINA_TIME_ZONE, type CashSessionClose } from "@purosur/domain";
import type {
  CashSessionClosesQuery,
  CashSessionClosesReportReader,
} from "@purosur/domain/register/use-cases";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { alias, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cashSessions, registers, users } from "../platform/db/schema.js";

const closeDay = sql<string>`to_char(${cashSessions.closedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleCashSessionClosesReader<TQueryResult extends PgQueryResultHKT>
  implements CashSessionClosesReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async closedCashSessions({
    locationId,
    range,
    registerId,
  }: CashSessionClosesQuery): Promise<CashSessionClose[]> {
    const cashiers = alias(users, "cashiers");
    const closers = alias(users, "closers");
    const rows = await this.db
      .select({
        id: cashSessions.id,
        closedAt: cashSessions.closedAt,
        registerId: cashSessions.registerId,
        registerName: registers.name,
        cashierId: cashSessions.openedBy,
        cashierName: cashiers.firstName,
        closedById: cashSessions.closedBy,
        closedByName: closers.firstName,
        expectedCash: cashSessions.expectedCash,
        countedCash: cashSessions.countedCash,
        difference: cashSessions.difference,
      })
      .from(cashSessions)
      .innerJoin(registers, eq(registers.id, cashSessions.registerId))
      .leftJoin(cashiers, sql`${cashiers.id}::text = ${cashSessions.openedBy}`)
      .leftJoin(closers, sql`${closers.id}::text = ${cashSessions.closedBy}`)
      .where(
        and(
          eq(cashSessions.locationId, locationId),
          isNotNull(cashSessions.closedAt),
          registerId === undefined ? undefined : eq(cashSessions.registerId, registerId),
          sql`${closeDay} >= ${range.from}`,
          sql`${closeDay} <= ${range.to}`,
        ),
      );

    return rows.map((row) => {
      if (
        row.closedAt === null ||
        row.closedById === null ||
        row.expectedCash === null ||
        row.countedCash === null ||
        row.difference === null
      ) {
        throw new Error(`The closed cash session ${row.id} is missing its closing`);
      }
      return {
        id: row.id,
        closedAt: row.closedAt,
        registerId: row.registerId,
        registerName: row.registerName,
        cashierId: row.cashierId,
        cashierName: row.cashierName,
        closedById: row.closedById,
        closedByName: row.closedByName,
        expectedCash: row.expectedCash,
        countedCash: row.countedCash,
        difference: row.difference,
      };
    });
  }
}
