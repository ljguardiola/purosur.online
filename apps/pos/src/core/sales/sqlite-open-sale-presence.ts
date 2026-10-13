import type { LocalDatabase } from "../platform/local-database";

export function anySaleIsOpen(database: LocalDatabase): boolean {
  return database.prepare("SELECT 1 FROM sales WHERE state = 'OPEN' LIMIT 1").get() !== undefined;
}
