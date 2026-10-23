import type {
  SupplierPriceListReadingInProgress,
  SupplierPriceListReadings,
} from "@purosur/domain/purchasing/use-cases";
import { asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceLists } from "../platform/db/schema.js";
import { SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER } from "./supplier-price-list-reading-task-identifier.js";

// The reading job is queued under the list's id as its key, and a worker holds its lock for as
// long as it reads the list, so the lock's instant is when the current reading started.
const readingStartedAt = sql<Date | null>`(
  select jobs.locked_at from graphile_worker.jobs
  where jobs.key = ${supplierPriceLists}.${sql.identifier(supplierPriceLists.id.name)}::text
    and jobs.task_identifier = ${SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER}
)`.mapWith((value: string | Date | null) => (value === null ? null : new Date(value)));

export class DrizzleSupplierPriceListReadings<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListReadings
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async listInProgress(): Promise<SupplierPriceListReadingInProgress[]> {
    return this.db
      .select({
        listId: supplierPriceLists.id,
        sentAt: supplierPriceLists.sentAt,
        readingStartedAt,
      })
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.state, "READING"))
      .orderBy(asc(supplierPriceLists.uploadedAt), asc(supplierPriceLists.id));
  }
}
