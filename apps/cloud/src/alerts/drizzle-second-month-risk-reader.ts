import type { SecondMonthRiskReader } from "@purosur/domain/alerts/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { monthlyVoucherCounts } from "../fiscal/drizzle-exception-share-voucher-counts.js";
import { exceptionShareBreaches, fiscalAddresses } from "../platform/db/schema.js";

export class DrizzleSecondMonthRiskReader<TQueryResult extends PgQueryResultHKT>
  implements SecondMonthRiskReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  addressesWithRecordedBreach(
    month: string,
  ): ReturnType<SecondMonthRiskReader["addressesWithRecordedBreach"]> {
    return this.db
      .select({
        fiscalAddressId: sql<string>`${exceptionShareBreaches.fiscalAddressId}::text`,
        fiscalAddressName: fiscalAddresses.name,
      })
      .from(exceptionShareBreaches)
      .innerJoin(fiscalAddresses, eq(fiscalAddresses.id, exceptionShareBreaches.fiscalAddressId))
      .where(eq(exceptionShareBreaches.month, month));
  }

  async runningCounts(month: string): ReturnType<SecondMonthRiskReader["runningCounts"]> {
    const counts = await monthlyVoucherCounts(
      this.db,
      (columns) => sql`${columns.month} = ${month}`,
    );
    return counts.map(({ fiscalAddressId, exceptionCount, totalCount }) => ({
      fiscalAddressId,
      exceptionCount,
      totalCount,
    }));
  }
}
