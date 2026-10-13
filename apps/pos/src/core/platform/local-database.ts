import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type LocalDatabase = Database.Database;

export interface LocalMigration {
  name: string;
  sql: string;
}

const DURABLE_CONNECTION_PRAGMAS = [
  "foreign_keys = ON",
  // The driver compiles WAL's default synchronous level to NORMAL, which can lose a confirmed
  // transaction to a sudden power-off.
  "synchronous = FULL",
  "busy_timeout = 5000",
  "wal_autocheckpoint = 1000",
  "journal_size_limit = 67108864",
];

function opened(database: LocalDatabase): LocalDatabase {
  try {
    for (const pragma of DURABLE_CONNECTION_PRAGMAS) {
      database.pragma(pragma);
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function applyMigrations(
  database: LocalDatabase,
  migrations: readonly LocalMigration[],
  now: () => Date,
): void {
  database.pragma("journal_mode = WAL");
  database.exec(
    "CREATE TABLE IF NOT EXISTS applied_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    database
      .prepare<[], { name: string }>("SELECT name FROM applied_migrations")
      .all()
      .map((row) => row.name),
  );
  const record = database.prepare<[string, string]>(
    "INSERT INTO applied_migrations (name, applied_at) VALUES (?, ?)",
  );
  const pending = migrations
    .filter((migration) => !applied.has(migration.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const migration of pending) {
    database.transaction(() => {
      database.exec(migration.sql);
      record.run(migration.name, now().toISOString());
    })();
  }
}

export function openLocalDatabaseFile(path: string): LocalDatabase {
  mkdirSync(dirname(path), { recursive: true });
  return opened(new Database(path));
}

export function openReadOnlyLocalDatabaseFile(path: string): LocalDatabase {
  return opened(new Database(path, { readonly: true, fileMustExist: true }));
}

export function appliedMigrationNames(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  const database = openReadOnlyLocalDatabaseFile(path);
  try {
    const recorded = database
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'applied_migrations'",
      )
      .get();
    if (recorded === undefined) {
      return [];
    }
    return database
      .prepare<[], { name: string }>("SELECT name FROM applied_migrations")
      .all()
      .map((row) => row.name);
  } finally {
    database.close();
  }
}
