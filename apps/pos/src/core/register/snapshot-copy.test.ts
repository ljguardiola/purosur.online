import { existsSync } from "node:fs";
import { mkdtemp, open, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Durability } from "./durable-files";
import { copyAndCheck, SnapshotCopyFailed } from "./snapshot-copy";

let folder: string;
let databasePath: string;
let copyPath: string;
let live: Database.Database;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "snapshot-copy-"));
  databasePath = join(folder, "register.sqlite");
  copyPath = join(folder, "generation.sqlite.tmp");
  live = new Database(databasePath);
  live.pragma("journal_mode = WAL");
  live.exec(`
    CREATE TABLE parents (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parents(id));
  `);
  const insert = live.prepare("INSERT INTO parents (id, name) VALUES (?, ?)");
  for (let id = 1; id <= 200; id += 1) {
    insert.run(id, `parent ${id} ${"x".repeat(200)}`);
  }
  live.prepare("INSERT INTO children (id, parent_id) VALUES (1, 1)").run();
});

afterEach(async () => {
  live.close();
  await rm(folder, { recursive: true, force: true });
});

const untouched: Durability = { file: async () => {}, folder: async () => {} };

function rowsOf(path: string, sql: string): unknown[] {
  const database = new Database(path, { readonly: true });
  try {
    return database.prepare(sql).all();
  } finally {
    database.close();
  }
}

async function failureOf(run: Promise<unknown>): Promise<SnapshotCopyFailed> {
  const failure = await run.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(SnapshotCopyFailed);
  return failure as SnapshotCopyFailed;
}

describe("copyAndCheck", () => {
  it("copies what the live database holds, including rows still in its log", async () => {
    await copyAndCheck({ databasePath, copyPath, durability: untouched });

    expect(rowsOf(copyPath, "SELECT count(*) AS total FROM parents")).toEqual([{ total: 200 }]);
    expect(rowsOf(copyPath, "SELECT id, parent_id FROM children")).toEqual([
      { id: 1, parent_id: 1 },
    ]);
  });

  it("flushes the finished copy and then its folder", async () => {
    const steps: string[] = [];
    const durability: Durability = {
      file: async (path) => {
        steps.push(
          `file ${path} ${rowsOf(path, "SELECT count(*) AS total FROM parents")[0] !== undefined}`,
        );
      },
      folder: async (path) => {
        steps.push(`folder ${path}`);
      },
    };

    await copyAndCheck({ databasePath, copyPath, durability });

    expect(steps).toEqual([`file ${copyPath} true`, `folder ${folder}`]);
  });

  it("leaves the live database as it was", async () => {
    await copyAndCheck({ databasePath, copyPath, durability: untouched });

    expect(live.prepare("SELECT count(*) AS total FROM parents").get()).toEqual({ total: 200 });
    expect(live.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
  });

  it("fails at the copy when the live database is missing, leaving nothing behind", async () => {
    const failure = await failureOf(
      copyAndCheck({
        databasePath: join(folder, "missing.sqlite"),
        copyPath,
        durability: untouched,
      }),
    );

    expect(failure.stage).toBe("copy");
    expect(existsSync(copyPath)).toBe(false);
  });

  it("fails at the copy when the copy cannot be flushed, leaving nothing behind", async () => {
    const failure = await failureOf(
      copyAndCheck({
        databasePath,
        copyPath,
        durability: {
          file: async () => {
            throw new Error("disk error");
          },
          folder: async () => {},
        },
      }),
    );

    expect(failure.stage).toBe("copy");
    expect(existsSync(copyPath)).toBe(false);
  });

  it("checks the copy and not the live database, which is healthy", async () => {
    const damageTheCopy: Durability = {
      file: async (path) => {
        const handle = await open(path, "r+");
        try {
          await handle.write(Buffer.alloc(4096, 0xff), 0, 4096, 4096);
        } finally {
          await handle.close();
        }
      },
      folder: async () => {},
    };

    const failure = await failureOf(
      copyAndCheck({ databasePath, copyPath, durability: damageTheCopy }),
    );

    expect(failure.stage).toBe("integrity_check");
    expect(live.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    expect(existsSync(copyPath)).toBe(false);
  });

  it("fails the foreign key check when a row points at nothing, leaving nothing behind", async () => {
    live.pragma("foreign_keys = OFF");
    live.prepare("INSERT INTO children (id, parent_id) VALUES (2, 999)").run();

    const failure = await failureOf(
      copyAndCheck({ databasePath, copyPath, durability: untouched }),
    );

    expect(failure.stage).toBe("foreign_key_check");
    expect(existsSync(copyPath)).toBe(false);
    expect(await readdir(folder)).not.toContain("generation.sqlite.tmp");
  });
});
