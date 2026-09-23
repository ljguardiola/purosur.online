import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { provideTestDatabaseSnapshot } from "./test-database-snapshot.js";

async function writeMigrations(folder: string, tables: string[]): Promise<void> {
  await mkdir(join(folder, "meta"), { recursive: true });
  const entries = tables.map((table, index) => ({
    idx: index,
    version: "7",
    when: index,
    tag: `000${index}_${table}`,
    breakpoints: true,
  }));
  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries }),
  );
  for (const [index, table] of tables.entries()) {
    await writeFile(
      join(folder, `000${index}_${table}.sql`),
      `create table "${table}" ("id" integer primary key)`,
    );
  }
}

async function tablesInSnapshot(snapshotPath: string | undefined): Promise<string[]> {
  if (!snapshotPath) {
    throw new Error("no snapshot was provided");
  }
  const client = new PGlite({ loadDataDir: new Blob([await readFile(snapshotPath)]) });
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    return rows.map(({ tablename }) => tablename);
  } finally {
    await client.close();
  }
}

// Each test starts up to four embedded Postgres databases, about a second apiece on a fast machine
// and several on a busy CI one, which the default five-second test limit does not cover.
describe("provideTestDatabaseSnapshot", { timeout: 30_000 }, () => {
  it("rebuilds the provided snapshot from the migrations as they are when tests rerun", async () => {
    const folder = await mkdtemp(join(tmpdir(), "test-database-snapshot-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const migrationsFolder = join(folder, "migrations");
    await writeMigrations(migrationsFolder, ["first_table"]);
    const provided: (string | undefined)[] = [];
    const rerunHandlers: (() => Promise<void>)[] = [];

    await provideTestDatabaseSnapshot(
      {
        provide: (_key, snapshotPath) => {
          provided.push(snapshotPath);
        },
        onTestsRerun: (handler) => {
          rerunHandlers.push(handler);
        },
      },
      join(folder, "snapshot.tar"),
      migrationsFolder,
    );
    expect(await tablesInSnapshot(provided.at(-1))).toEqual(["first_table"]);

    await writeMigrations(migrationsFolder, ["first_table", "second_table"]);
    for (const rerun of rerunHandlers) {
      await rerun();
    }

    expect(await tablesInSnapshot(provided.at(-1))).toEqual(["first_table", "second_table"]);
  });

  it("provides no snapshot, rather than stopping the rerun, when the migrations break mid-session", async () => {
    const folder = await mkdtemp(join(tmpdir(), "test-database-snapshot-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const migrationsFolder = join(folder, "migrations");
    await writeMigrations(migrationsFolder, ["first_table"]);
    const provided: (string | undefined)[] = [];
    const rerunHandlers: (() => Promise<void>)[] = [];

    await provideTestDatabaseSnapshot(
      {
        provide: (_key, snapshotPath) => {
          provided.push(snapshotPath);
        },
        onTestsRerun: (handler) => {
          rerunHandlers.push(handler);
        },
      },
      join(folder, "snapshot.tar"),
      migrationsFolder,
    );
    await writeFile(join(migrationsFolder, "0000_first_table.sql"), "this is not sql");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => warn.mockRestore());

    for (const rerun of rerunHandlers) {
      await expect(rerun()).resolves.toBeUndefined();
    }

    expect(provided.at(-1)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("could not rebuild the test database snapshot"),
      expect.anything(),
    );
  });
});
