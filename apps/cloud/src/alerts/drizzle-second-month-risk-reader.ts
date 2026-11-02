import type { SecondMonthRiskReader } from "@purosur/domain/alerts/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleArcaAvailabilityReader } from "../fiscal/drizzle-arca-availability-reader.js";
import { DrizzleContingencyIntervalsReader } from "../fiscal/drizzle-contingency-intervals-reader.js";
import { monthlyVoucherCounts } from "../fiscal/drizzle-exception-share-voucher-counts.js";
import { exceptionShareBreaches, fiscalAddresses } from "../platform/db/schema.js";

export class DrizzleSecondMonthRiskReader<TQueryResult extends PgQueryResultHKT>
  implements SecondMonthRiskReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async fiscalAddressesWithRecordedBreach(
    month: string,
  ): ReturnType<SecondMonthRiskReader["fiscalAddressesWithRecordedBreach"]> {
    const breaches = await this.db
      .select({ fiscalAddressId: sql<string>`${exceptionShareBreaches.fiscalAddressId}::text` })
      .from(exceptionShareBreaches)
      .where(eq(exceptionShareBreaches.month, month));
    return breaches.map(({ fiscalAddressId }) => fiscalAddressId);
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

  fiscalAddresses(): ReturnType<SecondMonthRiskReader["fiscalAddresses"]> {
    return this.db
      .select({
        fiscalAddressId: sql<string>`${fiscalAddresses.id}::text`,
        fiscalAddressName: fiscalAddresses.name,
      })
      .from(fiscalAddresses);
  }

  availabilityRuns(
    window: Parameters<SecondMonthRiskReader["availabilityRuns"]>[0],
  ): ReturnType<SecondMonthRiskReader["availabilityRuns"]> {
    return new DrizzleArcaAvailabilityReader(this.db).availabilityRuns(window);
  }

  contingencyIntervalsAtFiscalAddress(
    query: Parameters<SecondMonthRiskReader["contingencyIntervalsAtFiscalAddress"]>[0],
  ): ReturnType<SecondMonthRiskReader["contingencyIntervalsAtFiscalAddress"]> {
    return new DrizzleContingencyIntervalsReader(this.db).contingencyIntervalsAtFiscalAddress(
      query,
    );
  }
}
