import type {
  AiCallRecord,
  SupplierPriceListAiCallStore,
} from "@purosur/domain/purchasing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { insertAiCallRecords } from "./drizzle-ai-call-records.js";

export class DrizzleSupplierPriceListAiCallStore<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListAiCallStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  record(records: AiCallRecord[]): Promise<void> {
    return this.db.transaction((tx) => insertAiCallRecords(tx, records));
  }
}
