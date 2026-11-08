import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  localDatabaseDamageIn,
  localDatabaseHealth,
  sqliteIntegrityHolds,
} from "./sqlite-local-database-health";

const folders: string[] = [];

function folder(): string {
  const created = mkdtempSync(join(tmpdir(), "purosur-pos-database-health-"));
  folders.push(created);
  return created;
}

afterEach(() => {
  for (const created of folders.splice(0)) {
    rmSync(created, { recursive: true, force: true });
  }
});

describe("sqliteIntegrityHolds", () => {
  it("holds for a healthy database", () => {
    const database = new Database(":memory:");
    database.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");

    expect(sqliteIntegrityHolds(database)).toBe(true);
  });

  it("does not hold when the integrity check finds a broken constraint", () => {
    const database = new Database(":memory:");
    database.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, size INTEGER CHECK (size > 0))");
    database.pragma("ignore_check_constraints = ON");
    database.exec("INSERT INTO notes (size) VALUES (-1)");
    database.pragma("ignore_check_constraints = OFF");

    expect(sqliteIntegrityHolds(database)).toBe(false);
  });

  it("does not hold when a row points at a row that is not there", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE authors (id INTEGER PRIMARY KEY);
      CREATE TABLE notes (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES authors (id));
    `);
    database.pragma("foreign_keys = OFF");
    database.exec("INSERT INTO notes (author_id) VALUES (7)");

    expect(sqliteIntegrityHolds(database)).toBe(false);
  });

  it("does not hold when the database raises damage while it is checked", () => {
    const database = {
      pragma: () => {
        throw new Database.SqliteError("database disk image is malformed", "SQLITE_CORRUPT");
      },
    };

    expect(sqliteIntegrityHolds(database)).toBe(false);
  });

  it("raises an error that is not damage", () => {
    const failure = new Database.SqliteError("database is locked", "SQLITE_BUSY");
    const database = {
      pragma: () => {
        throw failure;
      },
    };

    expect(() => sqliteIntegrityHolds(database)).toThrow(failure);
  });
});

describe("localDatabaseHealth", () => {
  const NOW = new Date("2026-10-06T09:30:00.000Z");

  function health(dataFolder: string, integrityHolds = () => true) {
    return localDatabaseHealth({ folder: dataFolder, now: () => NOW, integrityHolds });
  }

  it("has no damage recorded until it is recorded", async () => {
    const subject = health(folder());

    expect(await subject.damageRecorded()).toBe(false);

    await subject.recordDamage();

    expect(await subject.damageRecorded()).toBe(true);
  });

  it("keeps the recorded damage for the next start", async () => {
    const dataFolder = folder();

    await health(dataFolder).recordDamage();

    expect(await health(dataFolder).damageRecorded()).toBe(true);
  });

  it("dates the recorded damage with its clock", async () => {
    const dataFolder = folder();

    await health(dataFolder).recordDamage();

    expect(readFileSync(join(dataFolder, "local-database-damaged"), "utf8")).toBe(
      "2026-10-06T09:30:00.000Z",
    );
  });

  it("creates the folder of the recorded damage when it is missing", async () => {
    const dataFolder = join(folder(), "data");

    await health(dataFolder).recordDamage();

    expect(await health(dataFolder).damageRecorded()).toBe(true);
  });

  it("answers whether the integrity holds as the given check does", async () => {
    const dataFolder = folder();

    expect(await health(dataFolder, () => true).integrityHolds()).toBe(true);
    expect(await health(dataFolder, () => false).integrityHolds()).toBe(false);
  });
});

describe("localDatabaseDamageIn", () => {
  it("answers at once the damage the health of the same folder recorded", async () => {
    const dataFolder = folder();
    const damaged = localDatabaseDamageIn(dataFolder);

    expect(damaged()).toBe(false);

    await localDatabaseHealth({
      folder: dataFolder,
      now: () => new Date(),
      integrityHolds: () => true,
    }).recordDamage();

    expect(damaged()).toBe(true);
  });

  it("answers no damage when the register has no local data folder", () => {
    expect(localDatabaseDamageIn(undefined)()).toBe(false);
  });
});
