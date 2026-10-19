import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

export function sqliteFileBytes(prepare: (database: Database.Database) => void): Buffer {
  const folder = mkdtempSync(join(tmpdir(), "sqlite-fixture-"));
  try {
    const path = join(folder, "fixture.sqlite");
    const database = new Database(path);
    prepare(database);
    database.close();
    return readFileSync(path);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function validSqliteBytes(): Buffer {
  return sqliteFileBytes((database) => {
    database.exec("CREATE TABLE parents (id INTEGER PRIMARY KEY)");
  });
}

export function brokenForeignKeySqliteBytes(): Buffer {
  return sqliteFileBytes((database) => {
    database.exec(`
      CREATE TABLE parents (id INTEGER PRIMARY KEY);
      CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id));
      INSERT INTO children (id, parent_id) VALUES (1, 99);
    `);
  });
}
