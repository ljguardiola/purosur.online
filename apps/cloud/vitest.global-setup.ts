import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import { migrateFreshDatabase } from "./src/db/build-test-database.js";

declare module "vitest" {
  export interface ProvidedContext {
    /** Directory holding the cloud app compiled to JavaScript, laid out like the shipped package. */
    cloudBuildDir: string;
    /**
     * File holding a data-dir dump (see PGlite's `dumpDataDir`) of a database already migrated
     * with the default migrations folder. `buildTestDatabase` loads it instead of migrating again,
     * so the migrations run once per test run rather than once per test file.
     */
    testDatabaseSnapshotPath?: string;
  }
}

const CLOUD_DIR = fileURLToPath(new URL("./", import.meta.url));
const TSC_BIN = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/**
 * Migrates one PGlite database with the default migrations and dumps it to `buildRoot`, so every
 * test file can load that snapshot instead of migrating its own database from scratch. Compression
 * is skipped: the dump only ever moves across the local filesystem, and every test file pays to
 * decompress it once loading its own copy.
 */
async function buildTestDatabaseSnapshot(buildRoot: string): Promise<string> {
  const client = await migrateFreshDatabase();
  try {
    const dump = await client.dumpDataDir("none");
    const snapshotPath = join(buildRoot, "test-database-snapshot.tar");
    writeFileSync(snapshotPath, Buffer.from(await dump.arrayBuffer()));
    return snapshotPath;
  } finally {
    await client.close();
  }
}

// The command entrypoints import sibling modules, which Node's type stripping cannot resolve from
// a raw .ts file, so tests that spawn a command run the compiled JavaScript instead. It is built
// outside apps/cloud/dist so a test run never overwrites or depends on a developer's own build.
export default async function setup(project: TestProject): Promise<() => void> {
  // Resolved because each entrypoint compares process.argv[1] with its own realpath'd module URL,
  // which differ when the temp dir sits behind a symlink (macOS /var -> /private/var).
  const buildRoot = realpathSync(mkdtempSync(join(tmpdir(), "purosur-cloud-build-")));
  try {
    execFileSync(
      process.execPath,
      [TSC_BIN, "-p", join(CLOUD_DIR, "tsconfig.json"), "--outDir", join(buildRoot, "dist")],
      { stdio: "inherit" },
    );
    // Mirrors the package: dist/ beside migrations/, an ESM package.json, and its dependencies.
    cpSync(join(CLOUD_DIR, "package.json"), join(buildRoot, "package.json"));
    cpSync(join(CLOUD_DIR, "migrations"), join(buildRoot, "migrations"), { recursive: true });
    symlinkSync(join(CLOUD_DIR, "node_modules"), join(buildRoot, "node_modules"), "dir");

    project.provide("cloudBuildDir", join(buildRoot, "dist"));
    project.provide("testDatabaseSnapshotPath", await buildTestDatabaseSnapshot(buildRoot));
  } catch (error) {
    rmSync(buildRoot, { recursive: true, force: true });
    throw error;
  }

  return () => {
    rmSync(buildRoot, { recursive: true, force: true });
  };
}
