import Database from "better-sqlite3";

export function isDatabaseDamage(error: unknown): boolean {
  return (
    error instanceof Database.SqliteError &&
    (error.code.startsWith("SQLITE_CORRUPT") || error.code.startsWith("SQLITE_NOTADB"))
  );
}
