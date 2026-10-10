import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export interface PurchasingRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}
