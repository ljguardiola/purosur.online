import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { TestDatabase } from "../../test-support/build-test-database.js";

export async function rowsReadFrom<T>(
  client: PGlite,
  table: string,
  run: (db: TestDatabase["db"]) => Promise<T>,
): Promise<{ result: T; rows: number }> {
  const statements: { query: string; params: unknown[] }[] = [];
  const db = drizzle(client, {
    logger: { logQuery: (query, params) => statements.push({ query, params }) },
  });
  const result = await run(db);
  let rows = 0;
  for (const { query, params } of statements) {
    if (query.includes(`"${table}"`)) {
      rows += (await client.query(query, params)).rows.length;
    }
  }
  return { result, rows };
}
