import Database from "better-sqlite3";

export function isDiskFull(error: unknown): boolean {
  return error instanceof Database.SqliteError && error.code === "SQLITE_FULL";
}
