import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Directory holding the cloud app compiled to JavaScript, laid out like the shipped package. */
    cloudBuildDir: string;
  }
}

const CLOUD_DIR = fileURLToPath(new URL("./", import.meta.url));
const TSC_BIN = createRequire(import.meta.url).resolve("typescript/bin/tsc");

// The command entrypoints import sibling modules, which Node's type stripping cannot resolve from
// a raw .ts file, so tests that spawn a command run the compiled JavaScript instead. It is built
// outside apps/cloud/dist so a test run never overwrites or depends on a developer's own build.
export default function setup(project: TestProject): () => void {
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
  } catch (error) {
    rmSync(buildRoot, { recursive: true, force: true });
    throw error;
  }

  project.provide("cloudBuildDir", join(buildRoot, "dist"));

  return () => {
    rmSync(buildRoot, { recursive: true, force: true });
  };
}
