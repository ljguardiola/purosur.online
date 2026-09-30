import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type LocalMigration, openLocalDatabase } from "./local-database";

const folders: string[] = [];

function databasePath(): string {
  const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-database-"));
  folders.push(folder);
  return join(folder, "nested", "register.sqlite");
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

const FIRST: LocalMigration = {
  name: "0000_notes",
  sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",
};
const SECOND: LocalMigration = {
  name: "0001_note_authors",
  sql: "ALTER TABLE notes ADD COLUMN author TEXT NOT NULL DEFAULT 'nadie';",
};

describe("the register's local database", () => {
  it("is created in its folder, writing ahead to a log", () => {
    const database = openLocalDatabase(databasePath(), [FIRST]);

    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    database.close();
  });

  it("applies every migration once, in the order of their names", () => {
    const path = databasePath();

    openLocalDatabase(path, [SECOND, FIRST]).close();
    const reopened = openLocalDatabase(path, [FIRST, SECOND]);
    reopened.prepare("INSERT INTO notes (body) VALUES ('hola')").run();

    expect(reopened.prepare("SELECT body, author FROM notes").all()).toEqual([
      { body: "hola", author: "nadie" },
    ]);
    reopened.close();
  });

  it("applies a migration added later over the data the previous schema already holds", () => {
    const path = databasePath();
    const before = openLocalDatabase(path, [FIRST]);
    before.prepare("INSERT INTO notes (body) VALUES ('antes')").run();
    before.close();

    const after = openLocalDatabase(path, [FIRST, SECOND]);

    expect(after.prepare("SELECT body, author FROM notes").all()).toEqual([
      { body: "antes", author: "nadie" },
    ]);
    after.close();
  });

  it("keeps nothing of a migration that fails, nor of the ones after it, and applies it once it is fixed", () => {
    const path = databasePath();
    const broken: LocalMigration = {
      name: "0001_broken",
      sql: "CREATE TABLE half (id INTEGER); INSERT INTO missing VALUES (1);",
    };
    const later: LocalMigration = { name: "0002_later", sql: "CREATE TABLE later (id INTEGER);" };

    expect(() => openLocalDatabase(path, [FIRST, broken, later])).toThrow(/missing/);

    const fixed = openLocalDatabase(path, [
      FIRST,
      { name: "0001_broken", sql: "CREATE TABLE half (id INTEGER);" },
      later,
    ]);
    const tables = fixed
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('half', 'later')")
      .all();
    expect(tables).toEqual([{ name: "half" }, { name: "later" }]);
    fixed.close();
  });
});
