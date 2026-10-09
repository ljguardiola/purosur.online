import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

export interface DedicatedConnections<TQueryResult extends PgQueryResultHKT> {
  withConnection<TOutcome>(
    work: (db: PgDatabase<TQueryResult>) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export function postgresDedicatedConnections(
  sql: postgres.Sql,
): DedicatedConnections<PostgresJsQueryResultHKT> {
  return {
    async withConnection(work) {
      const reserved = await sql.reserve();
      // postgres.js gives a reserved connection no `options`, which drizzle's driver sets the
      // parsers of dates and JSON on.
      Object.assign(reserved, { options: sql.options });
      try {
        return await work(drizzle(reserved));
      } finally {
        reserved.release();
      }
    },
  };
}
