import type { SupplierPriceListFiles } from "@purosur/domain/purchasing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export interface PurchasingRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
  // Present only when the AI reading of supplier price lists is configured.
  supplierPriceListFiles?: SupplierPriceListFiles;
}
