import { readFile, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// Loaded outside any test worker (by the node project's global setup), so this module must not
// import "vitest".

export const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

// `clusterDumpPath` is required (not optional) so no caller can pay initdb's cost, which
// dominates the cost of building a test database, by omitting it.
export async function migrateFreshDatabase(
  migrationsFolder: string,
  clusterDumpPath: string,
): Promise<PGlite> {
  const client = new PGlite({ loadDataDir: new Blob([await readFile(clusterDumpPath)]) });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    return client;
  } catch (error) {
    // A failure to close must not replace this migration error, which is the one worth reporting.
    await client.close().catch(() => undefined);
    throw error;
  }
}

export interface SnapshotConsumer {
  provide(
    key: "testDatabaseSnapshotPath" | "testDatabaseClusterDumpPath",
    value: string | undefined,
  ): void;
  onTestsRerun(handler: () => Promise<void>): void;
}

// Runs initdb once, so every database built from a custom migrations folder can load this dump
// instead of paying for its own initdb.
async function writeEmptyClusterDump(clusterDumpPath: string): Promise<void> {
  const client = new PGlite();
  try {
    const dump = await client.dumpDataDir("none");
    await writeFile(clusterDumpPath, Buffer.from(await dump.arrayBuffer()));
  } finally {
    await client.close();
  }
}

// Compression is skipped: the dump only ever moves across the local filesystem, and every test
// file would pay to decompress its own copy.
async function writeSnapshot(
  snapshotPath: string,
  migrationsFolder: string,
  clusterDumpPath: string,
): Promise<void> {
  const client = await migrateFreshDatabase(migrationsFolder, clusterDumpPath);
  try {
    const dump = await client.dumpDataDir("none");
    await writeFile(snapshotPath, Buffer.from(await dump.arrayBuffer()));
  } finally {
    await client.close();
  }
}

// The snapshot loads from this same cluster dump, so initdb runs exactly once. Only the snapshot
// is rebuilt on a rerun, since the cluster dump doesn't depend on migrations.
export async function provideTestDatabaseSnapshot(
  project: SnapshotConsumer,
  snapshotPath: string,
  clusterDumpPath: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  await writeEmptyClusterDump(clusterDumpPath);
  project.provide("testDatabaseClusterDumpPath", clusterDumpPath);

  await writeSnapshot(snapshotPath, migrationsFolder, clusterDumpPath);
  project.provide("testDatabaseSnapshotPath", snapshotPath);
  project.onTestsRerun(async () => {
    try {
      await writeSnapshot(snapshotPath, migrationsFolder, clusterDumpPath);
      project.provide("testDatabaseSnapshotPath", snapshotPath);
    } catch (error) {
      // A rejected rerun hook would end the watch session; warning instead lets every file
      // migrate on its own and report the migration's error.
      console.warn(
        "could not rebuild the test database snapshot; files migrate on their own",
        error,
      );
      project.provide("testDatabaseSnapshotPath", undefined);
    }
  });
}
