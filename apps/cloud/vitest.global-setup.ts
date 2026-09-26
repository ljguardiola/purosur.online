import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import { provideTestDatabaseSnapshot } from "./src/db/test-database-snapshot.js";

declare module "vitest" {
  export interface ProvidedContext {
    /** Directory holding the cloud app compiled to JavaScript, laid out like the shipped package. */
    cloudBuildDir: string;
    /**
     * A PGlite data-dir dump of a database already migrated with the default migrations folder;
     * `buildTestDatabase` loads it so migrations run once per test run, not once per test file.
     */
    testDatabaseSnapshotPath?: string;
    /**
     * A PGlite data-dir dump of an empty, freshly-initialized cluster; `migrateFreshDatabase`
     * always loads it so initdb runs once per test run, not once per database built.
     */
    testDatabaseClusterDumpPath: string;
  }
}

const CLOUD_DIR = fileURLToPath(new URL("./", import.meta.url));
const CONTRACTS_DIR = fileURLToPath(new URL("../../packages/contracts/", import.meta.url));
const TSC_BIN = createRequire(import.meta.url).resolve("typescript/bin/tsc");

// The command entrypoints import sibling modules, which Node's type stripping cannot resolve from
// a raw .ts file, so tests that spawn a command run the compiled JavaScript instead. The cloud is
// built outside apps/cloud/dist so a test run never overwrites a developer's own cloud build.
export default async function setup(project: TestProject): Promise<() => void> {
  // Resolved because each entrypoint compares process.argv[1] with its own realpath'd module URL,
  // which differ when the temp dir sits behind a symlink (macOS /var -> /private/var).
  const buildRoot = realpathSync(mkdtempSync(join(tmpdir(), "purosur-cloud-build-")));
  try {
    // Cloud reads contracts' compiled declarations through node_modules, not project references
    // (the `-p`/`--outDir` compile below isn't `-b`, so it never builds them itself).
    execFileSync(process.execPath, [TSC_BIN, "-b", CONTRACTS_DIR], { stdio: "inherit" });
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
    await provideTestDatabaseSnapshot(
      project,
      join(buildRoot, "test-database-snapshot.tar"),
      join(buildRoot, "test-database-cluster-dump.tar"),
    );
  } catch (error) {
    rmSync(buildRoot, { recursive: true, force: true });
    throw error;
  }

  return () => {
    rmSync(buildRoot, { recursive: true, force: true });
  };
}
