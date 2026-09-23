import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, onTestFinished } from "vitest";
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

describe("provideTestDatabaseSnapshot", () => {
  it("rebuilds the provided snapshot from the migrations as they are when tests rerun", async () => {
    const folder = await mkdtemp(join(tmpdir(), "test-database-snapshot-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const migrationsFolder = join(folder, "migrations");
    await writeMigrations(migrationsFolder, ["first_table"]);
    const provided: string[] = [];
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
});
