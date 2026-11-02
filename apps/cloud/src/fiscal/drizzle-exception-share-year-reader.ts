import type {
  ExceptionShareFiscalAddress,
  ExceptionShareYearQuery,
  ExceptionShareYearReader,
  MonthlyVoucherCounts,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { exceptionShareBreaches, fiscalAddresses } from "../platform/db/schema.js";
import { monthlyVoucherCounts } from "./drizzle-exception-share-voucher-counts.js";

export class DrizzleExceptionShareYearReader<TQueryResult extends PgQueryResultHKT>
  implements ExceptionShareYearReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async fiscalAddress(fiscalAddressId: string): Promise<ExceptionShareFiscalAddress | undefined> {
    const [row] = await this.db
      .select({ id: sql<string>`${fiscalAddresses.id}::text`, name: fiscalAddresses.name })
      .from(fiscalAddresses)
      .where(eq(fiscalAddresses.id, fiscalAddressId));
    return row;
  }

  async monthlyVoucherCounts({
    fiscalAddressId,
    year,
  }: ExceptionShareYearQuery): Promise<MonthlyVoucherCounts[]> {
    const counts = await monthlyVoucherCounts(this.db, {
      months: { from: `${year}-01`, through: `${year}-12` },
      fiscalAddressId,
    });
    return counts.map(({ month, exceptionCount, totalCount }) => ({
      month,
      exceptionCount,
      totalCount,
    }));
  }

  async recordedBreachMonths({
    fiscalAddressId,
    year,
  }: ExceptionShareYearQuery): Promise<string[]> {
    const rows = await this.db
      .select({ month: exceptionShareBreaches.month })
      .from(exceptionShareBreaches)
      .where(
        and(
          eq(exceptionShareBreaches.fiscalAddressId, fiscalAddressId),
          sql`${exceptionShareBreaches.month} like ${`${year}-%`}`,
        ),
      );
    return rows.map(({ month }) => month);
  }
}
