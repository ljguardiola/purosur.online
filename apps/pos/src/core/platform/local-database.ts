import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type LocalDatabase = Database.Database;

export interface LocalMigration {
  name: string;
  sql: string;
}

export function applyMigrations(
  database: LocalDatabase,
  migrations: readonly LocalMigration[],
  now: () => Date,
): void {
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
  const database = new Database(path);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function appliedMigrationNames(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  const database = new Database(path, { readonly: true, fileMustExist: true });
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
