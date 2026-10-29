import { type AnyColumn, type SQL, sql } from "drizzle-orm";

export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export function containsText(column: AnyColumn | SQL, text: string): SQL {
  return sql`unaccent(${column}) ilike unaccent(${containsPattern(text)})`;
}
