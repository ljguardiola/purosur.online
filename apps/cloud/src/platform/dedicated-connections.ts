import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

export interface DedicatedConnections<TQueryResult extends PgQueryResultHKT> {
  withConnection<TOutcome>(
    work: (db: PgDatabase<TQueryResult>) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

type Scoped = <TResult>(
  work: (client: postgres.ReservedSql) => Promise<TResult>,
) => Promise<TResult>;

async function scoped<TResult>(
  reserved: postgres.ReservedSql,
  [open, close, abandon]: readonly [string, string, string],
  work: (client: postgres.ReservedSql) => Promise<TResult>,
): Promise<TResult> {
  await reserved.unsafe(open);
  try {
    const result = await work(reserved);
    await reserved.unsafe(close);
    return result;
  } catch (error) {
    await reserved.unsafe(abandon);
    throw error;
  }
}

// A reserved postgres.js connection has no `begin` or `savepoint`, which drizzle's `transaction`
// calls.
function withTransactions(reserved: postgres.ReservedSql): {
  begin: Scoped;
  savepoint: Scoped;
} {
  let savepoints = 0;
  return {
    begin: (work) => scoped(reserved, ["begin", "commit", "rollback"], work),
    savepoint: (work) => {
      savepoints += 1;
      const name = `dedicated_connection_savepoint_${savepoints}`;
      return scoped(
        reserved,
        [`savepoint ${name}`, `release savepoint ${name}`, `rollback to savepoint ${name}`],
        work,
      );
    },
  };
}

export function postgresDedicatedConnections(
  sql: postgres.Sql,
): DedicatedConnections<PostgresJsQueryResultHKT> {
  return {
    async withConnection(work) {
      const reserved = await sql.reserve();
      // postgres.js gives a reserved connection no `options`, which drizzle's driver sets the
      // parsers of dates and JSON on.
      Object.assign(reserved, { options: sql.options, ...withTransactions(reserved) });
      try {
        return await work(drizzle(reserved));
      } finally {
        reserved.release();
      }
    },
  };
}
