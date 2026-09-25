import { readFile, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// Loaded by the "node" project's global setup, which runs outside any test worker, so this module
// must not import "vitest".

export const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

/**
 * Creates a PGlite instance and runs the given migrations against it. Used both by
 * `buildTestDatabase` (when it has no matching snapshot to load) and by the "node" project's
 * global setup, which builds the one snapshot every test file starts from.
 *
 * `clusterDumpPath` (a dump of an empty, already-initialized cluster, see `writeEmptyClusterDump`)
 * is required so no caller can pay initdb's cost, which dominates the cost of building a test
 * database, by omitting it; the "node" project's global setup builds that dump once per test run,
 * and every caller of this function runs only within that project.
 */
export async function migrateFreshDatabase(
  migrationsFolder: string,
  clusterDumpPath: string,
): Promise<PGlite> {
  const client = new PGlite({ loadDataDir: new Blob([await readFile(clusterDumpPath)]) });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    return client;
  } catch (error) {
    // A failure to close must not replace the migration error, which is the one worth reporting.
    await client.close().catch(() => undefined);
    throw error;
  }
}

/** The part of Vitest's `TestProject` the snapshot needs: providing it and hearing about reruns. */
export interface SnapshotConsumer {
  provide(
    key: "testDatabaseSnapshotPath" | "testDatabaseClusterDumpPath",
    value: string | undefined,
  ): void;
  onTestsRerun(handler: () => Promise<void>): void;
}

/**
 * Runs initdb once and dumps the resulting empty cluster to `clusterDumpPath`, so every database
 * built from a custom migrations folder can load it instead of paying for its own initdb.
 */
async function writeEmptyClusterDump(clusterDumpPath: string): Promise<void> {
  const client = new PGlite();
  try {
    const dump = await client.dumpDataDir("none");
    await writeFile(clusterDumpPath, Buffer.from(await dump.arrayBuffer()));
  } finally {
    await client.close();
  }
}

/**
 * Migrates one PGlite database and dumps it to `snapshotPath`, so every test file can load that
 * snapshot instead of migrating its own database from scratch. Compression is skipped: the dump
 * only ever moves across the local filesystem, and every test file pays to decompress it once
 * loading its own copy.
 */
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

/**
 * Builds the empty cluster dump and the migrated snapshot (itself loaded from that same cluster
 * dump, so initdb runs exactly once) and provides both to the project, then rebuilds and
 * re-provides the migrated snapshot before every rerun, so in watch mode a migration added or
 * edited after startup reaches the rerun tests. The cluster dump does not depend on migrations, so
 * it is never rebuilt.
 */
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
      // A migration mid-edit must not end the watch session, which is what a rejected rerun hook
      // does. With no snapshot, every file migrates on its own and reports the migration's error.
      console.warn(
        "could not rebuild the test database snapshot; files migrate on their own",
        error,
      );
      project.provide("testDatabaseSnapshotPath", undefined);
    }
  });
}
