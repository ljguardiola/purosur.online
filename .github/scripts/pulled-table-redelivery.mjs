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

const CURSOR_UNDER_WAY = 1;

function redeliversFromFirstChange(database, table) {
  return (
    database.prepare(`SELECT cursor FROM ${DECLARATION_TABLE} WHERE table_name = ?`).get(table)
      ?.cursor === 0
  );
}

function startEveryRedelivery(database, tables) {
  database.exec(`DELETE FROM ${DECLARATION_TABLE}`);
  const declare = database.prepare(
    `INSERT INTO ${DECLARATION_TABLE} (table_name, cursor) VALUES (?, ${CURSOR_UNDER_WAY})`,
  );
  for (const table of tables) {
    declare.run(table);
  }
}

// Each migration starts from a register still redelivering every pulled table, which a register
// applying several migrations at once, or one that has not finished a redelivery, can be.
export function findUndeclaredRedeliveries({ migrations, pulledTables }) {
  const database = new DatabaseSync(":memory:");
  const violations = [];
  try {
    const ordered = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
    for (const migration of ordered) {
      const before = columnsOfTables(database);
      if (before.has(DECLARATION_TABLE)) {
        startEveryRedelivery(database, Object.keys(pulledTables));
      }
      try {
        database.exec(migration.sql);
      } catch (error) {
        violations.push({ migration: migration.name, failure: error.message });
        continue;
      }
      const now = columnsOfTables(database);
      if (!now.has(DECLARATION_TABLE)) {
        continue;
      }
      for (const table of Object.keys(pulledTables)) {
        const columnsBefore = before.get(table);
        const added = (now.get(table) ?? []).filter((column) => !columnsBefore?.includes(column));
        if (
          columnsBefore !== undefined &&
          added.length > 0 &&
          !redeliversFromFirstChange(database, table)
        ) {
          violations.push({ migration: migration.name, table, columns: added });
        }
      }
    }
  } finally {
    database.close();
  }
  return violations;
}

export function describeViolation(violation) {
  if ("failure" in violation) {
    return `${violation.migration}: fails on a register redelivering every pulled table: ${violation.failure}`;
  }
  const { migration, table, columns } = violation;
  return `${migration}: ${table} gained ${columns.join(", ")} without its redelivery being declared from the first change in ${DECLARATION_TABLE}`;
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
