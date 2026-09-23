import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// Loaded by the "node" project's global setup, which runs outside any test worker, so this module
// must not import "vitest".

export const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

/**
 * Creates a fresh PGlite instance and runs the given migrations against it. Used both by
 * `buildTestDatabase` (when it has no matching snapshot to load) and by the "node" project's
 * global setup, which builds the one snapshot every test file starts from.
 */
export async function migrateFreshDatabase(
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<PGlite> {
  const client = new PGlite();
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
  provide(key: "testDatabaseSnapshotPath", snapshotPath: string): void;
  onTestsRerun(handler: () => Promise<void>): void;
}

/**
 * Migrates one PGlite database and dumps it to `snapshotPath`, so every test file can load that
 * snapshot instead of migrating its own database from scratch. Compression is skipped: the dump
 * only ever moves across the local filesystem, and every test file pays to decompress it once
 * loading its own copy.
 */
async function writeSnapshot(snapshotPath: string, migrationsFolder: string): Promise<void> {
  const client = await migrateFreshDatabase(migrationsFolder);
  try {
    const dump = await client.dumpDataDir("none");
    await writeFile(snapshotPath, Buffer.from(await dump.arrayBuffer()));
  } finally {
    await client.close();
  }
}

/**
 * Builds the snapshot and provides it to the project, then builds it again before every rerun, so
 * in watch mode a migration added or edited after startup reaches the rerun tests.
 */
export async function provideTestDatabaseSnapshot(
  project: SnapshotConsumer,
  snapshotPath: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  const rebuild = async () => {
    await writeSnapshot(snapshotPath, migrationsFolder);
    project.provide("testDatabaseSnapshotPath", snapshotPath);
  };
  await rebuild();
  project.onTestsRerun(rebuild);
}
