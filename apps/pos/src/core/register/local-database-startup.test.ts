import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalMigration } from "../platform/local-database";
import { startLocalDatabase } from "./local-database-startup";

const folders: string[] = [];

const NOTES: LocalMigration = {
  name: "0000_notes",
  sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL); CREATE INDEX notes_body ON notes (body);",
};
const NOW = new Date("2026-10-06T09:30:00.000Z");

function folder(): string {
  const created = mkdtempSync(join(tmpdir(), "purosur-pos-database-startup-"));
  folders.push(created);
  return created;
}

afterEach(() => {
  for (const created of folders.splice(0)) {
    rmSync(created, { recursive: true, force: true });
  }
});

function startWith(dataFolder: string, migrations = [NOTES]) {
  return startLocalDatabase({
    path: join(dataFolder, "register.sqlite"),
    migrations,
    now: () => NOW,
  });
}

function healthyDatabaseIn(dataFolder: string): void {
  const database = new Database(join(dataFolder, "register.sqlite"));
  database.pragma("journal_mode = WAL");
  database.exec(NOTES.sql);
  database.exec(
    "CREATE TABLE applied_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  database.exec("INSERT INTO applied_migrations VALUES ('0000_notes', '2026-01-01T00:00:00.000Z')");
  const insert = database.prepare("INSERT INTO notes (body) VALUES (?)");
  database.transaction(() => {
    for (let index = 0; index < 2000; index += 1) {
      insert.run(`note ${index} ${"x".repeat(50)}`);
    }
  })();
  database.close();
}

function overwritePage(dataFolder: string, page: number): void {
  const descriptor = openSync(join(dataFolder, "register.sqlite"), "r+");
  writeSync(descriptor, Buffer.alloc(4096, 0xab), 0, 4096, 4096 * page);
  closeSync(descriptor);
}

function damageRecordedIn(dataFolder: string): boolean {
  return existsSync(join(dataFolder, "local-database-damaged"));
}

const MORE: LocalMigration = { name: "0001_more", sql: "CREATE TABLE more (id INTEGER)" };

function bytesOfDatabaseFilesIn(dataFolder: string): Record<string, string> {
  const path = join(dataFolder, "register.sqlite");
  return Object.fromEntries(
    [path, `-wal`]
      .filter((file) => existsSync(file))
      .map((file) => [file, readFileSync(file).toString("base64")]),
  );
}

describe("starting the register's local database", () => {
  it("is ready with its migrations applied for a new database", async () => {
    const dataFolder = folder();

    const started = await startWith(dataFolder);

    expect(started.kind).toBe("ready");
    if (started.kind === "ready") {
      expect(started.database.prepare("SELECT name FROM applied_migrations").all()).toEqual([
        { name: "0000_notes" },
      ]);
      started.database.close();
    }
    expect(damageRecordedIn(dataFolder)).toBe(false);
  });

  it("hands over the health that records a damage found while the register runs", async () => {
    const dataFolder = folder();

    const started = await startWith(dataFolder);

    expect(started.kind).toBe("ready");
    if (started.kind === "ready") {
      await started.health.recordDamage();
      expect(damageRecordedIn(dataFolder)).toBe(true);
      started.database.close();
    }
  });

  it("is ready and keeps the data of a healthy database", async () => {
    const dataFolder = folder();
    healthyDatabaseIn(dataFolder);

    const started = await startWith(dataFolder);

    expect(started.kind).toBe("ready");
    if (started.kind === "ready") {
      expect(started.database.prepare("SELECT count(*) AS total FROM notes").get()).toEqual({
        total: 2000,
      });
      started.database.close();
    }
  });

  it("is out of service and records the damage for a file that is not a database", async () => {
    const dataFolder = folder();
    writeFileSync(join(dataFolder, "register.sqlite"), "this is not a database ".repeat(500));

    expect(await startWith(dataFolder)).toEqual({ kind: "out_of_service" });
    expect(damageRecordedIn(dataFolder)).toBe(true);
  });

  it("is out of service and records the damage for a database with overwritten pages", async () => {
    const dataFolder = folder();
    healthyDatabaseIn(dataFolder);
    overwritePage(dataFolder, 3);

    expect(await startWith(dataFolder)).toEqual({ kind: "out_of_service" });
    expect(damageRecordedIn(dataFolder)).toBe(true);
  });

  it("is out of service for a healthy database while a damage is recorded", async () => {
    const dataFolder = folder();
    healthyDatabaseIn(dataFolder);
    writeFileSync(join(dataFolder, "local-database-damaged"), "2026-10-05T00:00:00.000Z");

    expect(await startWith(dataFolder)).toEqual({ kind: "out_of_service" });
  });

  it("is out of service while a damage is recorded, even when the database cannot be opened", async () => {
    const dataFolder = folder();
    mkdirSync(join(dataFolder, "register.sqlite"));
    writeFileSync(join(dataFolder, "local-database-damaged"), "2026-10-05T00:00:00.000Z");

    expect(await startWith(dataFolder)).toEqual({ kind: "out_of_service" });
  });

  it("keeps the damage recorded by an earlier start", async () => {
    const dataFolder = folder();
    healthyDatabaseIn(dataFolder);
    overwritePage(dataFolder, 3);
    await startWith(dataFolder);
    rmSync(join(dataFolder, "register.sqlite"));
    healthyDatabaseIn(dataFolder);

    expect(await startWith(dataFolder)).toEqual({ kind: "out_of_service" });
  });

  it("applies no migration to a database that is out of service", async () => {
    const dataFolder = folder();
    healthyDatabaseIn(dataFolder);
    writeFileSync(join(dataFolder, "local-database-damaged"), "2026-10-05T00:00:00.000Z");
    const pending: LocalMigration = { name: "0001_more", sql: "CREATE TABLE more (id INTEGER)" };

    await startWith(dataFolder, [NOTES, pending]);

    const database = new Database(join(dataFolder, "register.sqlite"), { readonly: true });
    expect(database.prepare("SELECT name FROM applied_migrations").all()).toEqual([
      { name: "0000_notes" },
    ]);
    database.close();
  });

  it("raises a migration failure that is not damage, leaving no damage recorded", async () => {
    const dataFolder = folder();
    const broken: LocalMigration = { name: "0000_broken", sql: "THIS IS NOT SQL" };

    await expect(startWith(dataFolder, [broken])).rejects.toThrow();
    expect(damageRecordedIn(dataFolder)).toBe(false);
  });

  describe("a database migrated by a newer version", () => {
    function newerDatabaseIn(dataFolder: string): void {
      healthyDatabaseIn(dataFolder);
      const database = new Database(join(dataFolder, "register.sqlite"));
      database.exec(MORE.sql);
      database.exec(
        "INSERT INTO applied_migrations VALUES ('0001_more', '2026-02-01T00:00:00.000Z')",
      );
      database.close();
    }

    it("is refused as newer than this version", async () => {
      const dataFolder = folder();
      newerDatabaseIn(dataFolder);

      expect(await startWith(dataFolder, [NOTES])).toEqual({ kind: "newer_than_version" });
    });

    it("is left byte for byte as it was", async () => {
      const dataFolder = folder();
      newerDatabaseIn(dataFolder);
      const before = bytesOfDatabaseFilesIn(dataFolder);

      await startWith(dataFolder, [NOTES]);

      expect(bytesOfDatabaseFilesIn(dataFolder)).toEqual(before);
    });

    it("is refused before its integrity is checked, recording no damage", async () => {
      const dataFolder = folder();
      newerDatabaseIn(dataFolder);
      overwritePage(dataFolder, 3);

      expect(await startWith(dataFolder, [NOTES])).toEqual({ kind: "newer_than_version" });
      expect(damageRecordedIn(dataFolder)).toBe(false);
    });

    it("is refused even while a damage is recorded", async () => {
      const dataFolder = folder();
      newerDatabaseIn(dataFolder);
      writeFileSync(join(dataFolder, "local-database-damaged"), "2026-10-05T00:00:00.000Z");

      expect(await startWith(dataFolder, [NOTES])).toEqual({ kind: "newer_than_version" });
    });
  });

  it("applies the migrations a database with fewer of them than this version knows lacks", async () => {
    const dataFolder = folder();
    healthyDatabaseIn(dataFolder);

    const started = await startWith(dataFolder, [NOTES, MORE]);

    expect(started.kind).toBe("ready");
    if (started.kind === "ready") {
      expect(
        started.database.prepare("SELECT name FROM applied_migrations ORDER BY name").all(),
      ).toEqual([{ name: "0000_notes" }, { name: "0001_more" }]);
      started.database.close();
    }
  });

  it("is out of service and records the damage when the applied migrations cannot be read", async () => {
    const dataFolder = folder();
    writeFileSync(join(dataFolder, "register.sqlite"), "this is not a database ".repeat(500));

    expect(await startWith(dataFolder)).toEqual({ kind: "out_of_service" });
    expect(damageRecordedIn(dataFolder)).toBe(true);
  });
});
