import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const DECLARATION_TABLE = "pulled_table_redeliveries";
const MIGRATIONS_FOLDER = "apps/pos/src/core/migrations";
const PULLED_TABLES_FILE = "apps/pos/src/core/sync/pulled-tables.ts";

function columnsOfTables(database) {
  const columns = new Map();
  const tables = database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  for (const { name } of tables) {
    const quoted = `"${name.replaceAll('"', '""')}"`;
    columns.set(
      name,
      database
        .prepare(`PRAGMA table_info(${quoted})`)
        .all()
        .map((column) => column.name),
    );
  }
  return columns;
}

function declaresTable(database, table) {
  return (
    database.prepare(`SELECT 1 FROM ${DECLARATION_TABLE} WHERE table_name = ?`).get(table) !==
    undefined
  );
}

// Each migration starts from a register that already finished every redelivery, so only what the
// migration itself declares counts.
export function findUndeclaredRedeliveries({ migrations, pulledTables }) {
  const database = new DatabaseSync(":memory:");
  const violations = [];
  try {
    const ordered = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
    for (const migration of ordered) {
      const before = columnsOfTables(database);
      if (before.has(DECLARATION_TABLE)) {
        database.exec(`DELETE FROM ${DECLARATION_TABLE}`);
      }
      database.exec(migration.sql);
      const now = columnsOfTables(database);
      if (!now.has(DECLARATION_TABLE)) {
        continue;
      }
      for (const table of Object.keys(pulledTables)) {
        const columnsBefore = before.get(table);
        const added = (now.get(table) ?? []).filter((column) => !columnsBefore?.includes(column));
        if (columnsBefore !== undefined && added.length > 0 && !declaresTable(database, table)) {
          violations.push({ migration: migration.name, table, columns: added });
        }
      }
    }
  } finally {
    database.close();
  }
  return violations;
}

export function describeViolation({ migration, table, columns }) {
  return `${migration}: ${table} gained ${columns.join(", ")} without being declared in ${DECLARATION_TABLE}`;
}

export function readMigrations(folder = MIGRATIONS_FOLDER) {
  return readdirSync(folder)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: file.replace(/\.sql$/, ""),
      sql: readFileSync(`${folder}/${file}`, "utf8"),
    }));
}

export async function readPulledTables(file = PULLED_TABLES_FILE) {
  const { PULLED_TABLES } = await import(pathToFileURL(file).href);
  return PULLED_TABLES;
}
