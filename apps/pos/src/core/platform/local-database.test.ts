import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appliedMigrationNames,
  applyMigrations,
  type LocalDatabase,
  type LocalMigration,
  openReadOnlyLocalDatabaseFile,
} from "./local-database";
import { migrationClock } from "./test-support/migration-clock";
import { openLocalDatabase } from "./test-support/open-local-database";

const folders: string[] = [];

function databasePath(): string {
  const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-database-"));
  folders.push(folder);
  return join(folder, "nested", "register.sqlite");
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

function connectionSettings(database: LocalDatabase) {
  return Object.fromEntries(
    ["foreign_keys", "synchronous", "busy_timeout", "wal_autocheckpoint", "journal_size_limit"].map(
      (name) => [name, database.pragma(name, { simple: true })],
    ),
  );
}

const DURABLE_CONNECTION = {
  foreign_keys: 1,
  synchronous: 2,
  busy_timeout: 5000,
  wal_autocheckpoint: 1000,
  journal_size_limit: 67_108_864,
};

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
    const database = openLocalDatabase(databasePath(), [FIRST], migrationClock);

    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    database.close();
  });

  it("opens a connection that keeps a confirmed transaction through a power cut and bounds its log", () => {
    const database = openLocalDatabase(databasePath(), [FIRST], migrationClock);

    expect(connectionSettings(database)).toEqual(DURABLE_CONNECTION);
    database.close();
  });

  it("opens a read-only connection with the same settings, over a file in write-ahead mode", () => {
    const path = databasePath();
    openLocalDatabase(path, [FIRST], migrationClock).close();
    const reader = openReadOnlyLocalDatabaseFile(path);

    expect(connectionSettings(reader)).toEqual(DURABLE_CONNECTION);
    expect(reader.pragma("journal_mode", { simple: true })).toBe("wal");
    reader.close();
  });

  it("switches a file kept in a rollback journal to writing ahead to a log when it is migrated", () => {
    const path = databasePath();
    mkdirSync(join(path, ".."), { recursive: true });
    const database = new Database(path);
    database.pragma("journal_mode = DELETE");

    applyMigrations(database, [FIRST], migrationClock);
    database.close();

    const reader = new Database(path, { readonly: true });
    expect(reader.pragma("journal_mode", { simple: true })).toBe("wal");
    reader.close();
  });

  it("applies every migration once, in the order of their names", () => {
    const path = databasePath();

    openLocalDatabase(path, [SECOND, FIRST], migrationClock).close();
    const reopened = openLocalDatabase(path, [FIRST, SECOND], migrationClock);
    reopened.prepare("INSERT INTO notes (body) VALUES ('hola')").run();

    expect(reopened.prepare("SELECT body, author FROM notes").all()).toEqual([
      { body: "hola", author: "nadie" },
    ]);
    reopened.close();
  });

  it("records each applied migration at the time its clock gives", () => {
    const database = openLocalDatabase(
      databasePath(),
      [FIRST, SECOND],
      () => new Date("2026-03-04T10:15:30.000Z"),
    );

    expect(
      database.prepare("SELECT name, applied_at FROM applied_migrations ORDER BY name").all(),
    ).toEqual([
      { name: "0000_notes", applied_at: "2026-03-04T10:15:30.000Z" },
      { name: "0001_note_authors", applied_at: "2026-03-04T10:15:30.000Z" },
    ]);
    database.close();
  });

  it("applies a migration added later over the data the previous schema already holds", () => {
    const path = databasePath();
    const before = openLocalDatabase(path, [FIRST], migrationClock);
    before.prepare("INSERT INTO notes (body) VALUES ('antes')").run();
    before.close();

    const after = openLocalDatabase(path, [FIRST, SECOND], migrationClock);

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

    expect(() => openLocalDatabase(path, [FIRST, broken, later], migrationClock)).toThrow(
      /missing/,
    );

    const fixed = openLocalDatabase(
      path,
      [FIRST, { name: "0001_broken", sql: "CREATE TABLE half (id INTEGER);" }, later],
      migrationClock,
    );
    const tables = fixed
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('half', 'later')")
      .all();
    expect(tables).toEqual([{ name: "half" }, { name: "later" }]);
    fixed.close();
  });
});

describe("the migrations a local database file already applied", () => {
  it("are the names the database recorded", () => {
    const path = databasePath();
    openLocalDatabase(path, [FIRST, SECOND], migrationClock).close();

    expect(appliedMigrationNames(path).sort()).toEqual(["0000_notes", "0001_note_authors"]);
  });

  it("are none when the file does not exist, and it is not created", () => {
    const path = databasePath();

    expect(appliedMigrationNames(path)).toEqual([]);
    expect(() => readFileSync(path)).toThrow(/ENOENT/);
  });

  it("are none when the database never recorded a migration", () => {
    const path = databasePath();
    mkdirSync(join(path, ".."), { recursive: true });
    const database = new Database(path);
    database.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY)");
    database.close();

    expect(appliedMigrationNames(path)).toEqual([]);
  });

  it("are read from a write-ahead database another connection created and closed", () => {
    const path = databasePath();
    const writer = openLocalDatabase(path, [FIRST], migrationClock);
    writer.prepare("INSERT INTO notes (body) VALUES ('hola')").run();
    writer.close();

    expect(appliedMigrationNames(path)).toEqual(["0000_notes"]);
  });

  it("are read while another connection holds the database open", () => {
    const path = databasePath();
    const writer = openLocalDatabase(path, [FIRST, SECOND], migrationClock);

    expect(appliedMigrationNames(path).sort()).toEqual(["0000_notes", "0001_note_authors"]);
    writer.close();
  });

  it("are read over a connection with the same settings as every other", () => {
    const path = databasePath();
    openLocalDatabase(path, [FIRST], migrationClock).close();
    const closedConnections: Record<string, unknown>[] = [];
    const close = Database.prototype.close;
    vi.spyOn(Database.prototype, "close").mockImplementation(function (this: LocalDatabase) {
      closedConnections.push(connectionSettings(this));
      return close.call(this);
    });

    appliedMigrationNames(path);

    expect(closedConnections).toEqual([DURABLE_CONNECTION]);
  });

  it("refuse a file that is not a database", () => {
    const path = databasePath();
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, Buffer.alloc(8192, 0xab));

    expect(() => appliedMigrationNames(path)).toThrow(/not a database/);
  });
});
