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

interface Provided {
  key: "testDatabaseSnapshotPath" | "testDatabaseClusterDumpPath";
  value: string | undefined;
}

// Each test initializes one embedded Postgres cluster from scratch, about a second on a fast machine
// and several on a busy CI one, then loads up to four more from dumps, which together the default
// five-second test limit does not cover.
describe("provideTestDatabaseSnapshot", { timeout: 30_000 }, () => {
  it("rebuilds the provided snapshot from the migrations as they are when tests rerun, without rebuilding the cluster dump", async () => {
    const folder = await mkdtemp(join(tmpdir(), "test-database-snapshot-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const migrationsFolder = join(folder, "migrations");
    await writeMigrations(migrationsFolder, ["first_table"]);
    const provided: Provided[] = [];
    const rerunHandlers: (() => Promise<void>)[] = [];

    await provideTestDatabaseSnapshot(
      {
        provide: (key, value) => {
          provided.push({ key, value });
        },
        onTestsRerun: (handler) => {
          rerunHandlers.push(handler);
        },
      },
      join(folder, "snapshot.tar"),
      join(folder, "cluster-dump.tar"),
      migrationsFolder,
    );
    const clusterDump = await readFile(join(folder, "cluster-dump.tar"));
    const clusterDumpsProvided = () =>
      provided.filter((entry) => entry.key === "testDatabaseClusterDumpPath");
    const snapshotsProvided = () =>
      provided.filter((entry) => entry.key === "testDatabaseSnapshotPath");
    expect(await tablesInSnapshot(snapshotsProvided().at(-1)?.value)).toEqual(["first_table"]);

    await writeMigrations(migrationsFolder, ["first_table", "second_table"]);
    for (const rerun of rerunHandlers) {
      await rerun();
    }

    expect(await tablesInSnapshot(snapshotsProvided().at(-1)?.value)).toEqual([
      "first_table",
      "second_table",
    ]);
    // The empty cluster dump does not depend on migrations, so a rerun never rebuilds or re-provides it.
    expect(clusterDumpsProvided()).toHaveLength(1);
    expect((await readFile(join(folder, "cluster-dump.tar"))).equals(clusterDump)).toBe(true);
  });

  it("provides no snapshot, rather than stopping the rerun, when the migrations break mid-session", async () => {
    const folder = await mkdtemp(join(tmpdir(), "test-database-snapshot-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const migrationsFolder = join(folder, "migrations");
    await writeMigrations(migrationsFolder, ["first_table"]);
    const provided: Provided[] = [];
    const rerunHandlers: (() => Promise<void>)[] = [];

    await provideTestDatabaseSnapshot(
      {
        provide: (key, value) => {
          provided.push({ key, value });
        },
        onTestsRerun: (handler) => {
          rerunHandlers.push(handler);
        },
      },
      join(folder, "snapshot.tar"),
      join(folder, "cluster-dump.tar"),
      migrationsFolder,
    );
    await writeFile(join(migrationsFolder, "0000_first_table.sql"), "this is not sql");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => warn.mockRestore());

    for (const rerun of rerunHandlers) {
      await expect(rerun()).resolves.toBeUndefined();
    }

    const snapshotsProvided = provided.filter((entry) => entry.key === "testDatabaseSnapshotPath");
    expect(snapshotsProvided.at(-1)?.value).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("could not rebuild the test database snapshot"),
      expect.anything(),
    );
  });
});
