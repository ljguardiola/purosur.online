import type { RecordedExceptionShareBreachReader } from "@purosur/domain/alerts/use-cases";
import { asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { exceptionShareBreaches, fiscalAddresses } from "../platform/db/schema.js";

export class DrizzleRecordedExceptionShareBreachReader<TQueryResult extends PgQueryResultHKT>
  implements RecordedExceptionShareBreachReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  recordedBreaches(): ReturnType<RecordedExceptionShareBreachReader["recordedBreaches"]> {
    return this.db
      .select({
        fiscalAddressId: sql<string>`${exceptionShareBreaches.fiscalAddressId}::text`,
        fiscalAddressName: fiscalAddresses.name,
        month: exceptionShareBreaches.month,
        exceptionCount: exceptionShareBreaches.exceptionCount,
        totalCount: exceptionShareBreaches.totalCount,
      })
      .from(exceptionShareBreaches)
      .innerJoin(fiscalAddresses, eq(fiscalAddresses.id, exceptionShareBreaches.fiscalAddressId))
      .orderBy(asc(exceptionShareBreaches.month), asc(exceptionShareBreaches.fiscalAddressId));
  }
}
