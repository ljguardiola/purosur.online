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
    cloudBuildDir: string;
    // Loaded once per test run, not once per test file, so migrations don't rerun for each one.
    testDatabaseSnapshotPath?: string;
    // Loaded once per test run, not once per database built, so initdb doesn't rerun for each one.
    testDatabaseClusterDumpPath: string;
  }
}

const CLOUD_DIR = fileURLToPath(new URL("./", import.meta.url));
const CONTRACTS_DIR = fileURLToPath(new URL("../../packages/contracts/", import.meta.url));
const TSC_BIN = createRequire(import.meta.url).resolve("typescript/bin/tsc");

// Node's type stripping can't resolve the entrypoints' sibling imports from a raw .ts file, so
// tests spawn the compiled JavaScript instead, built outside apps/cloud/dist to never overwrite a
// developer's own build.
export default async function setup(project: TestProject): Promise<() => void> {
  // Resolved because each entrypoint compares process.argv[1] with its own realpath'd module URL,
  // which differ when the temp dir sits behind a symlink (macOS /var -> /private/var).
  const buildRoot = realpathSync(mkdtempSync(join(tmpdir(), "purosur-cloud-build-")));
  try {
    // The cloud reads contracts' compiled declarations through node_modules, not project
    // references, so contracts must be built here first: the compile below (`-p`, not `-b`) never builds them itself.
    execFileSync(process.execPath, [TSC_BIN, "-b", CONTRACTS_DIR], { stdio: "inherit" });
    execFileSync(
      process.execPath,
      [TSC_BIN, "-p", join(CLOUD_DIR, "tsconfig.json"), "--outDir", join(buildRoot, "dist")],
      { stdio: "inherit" },
    );
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
