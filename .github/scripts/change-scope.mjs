import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";

const LOG_PREFIX = "change-scope";
const NULL_SHA = "0".repeat(40);

// Tailwind generates CSS from class names in any file under a source root, Markdown included, so
// a `.md` file there can still change what the app ships.
const NON_DOCS_ROOTS = ["apps/", "packages/", ".github/"];

export function isDocumentationOnly(path) {
  return path.endsWith(".md") && !NON_DOCS_ROOTS.some((root) => path.startsWith(root));
}

export function decideScope(changedPaths) {
  if (changedPaths === null) {
    return { docsOnly: false, reason: "could not determine the changed paths" };
  }
  if (changedPaths.length === 0) {
    return { docsOnly: false, reason: "no changed path was reported" };
  }

  const fullVerificationPath = changedPaths.find((path) => !isDocumentationOnly(path));
  if (fullVerificationPath !== undefined) {
    return { docsOnly: false, reason: `${fullVerificationPath} needs the full verification` };
  }
  return { docsOnly: true, reason: "every changed path is documentation-only" };
}

// No test project includes or imports anything under .claude/. Tailwind's scan of the whole
// repository reads it, but a utility generated from it only styles an element whose own source,
// scanned too, already names that class.
const TESTS_UNREAD_ROOTS = [".claude/"];

export function isUnreadByTests(path) {
  return isDocumentationOnly(path) || TESTS_UNREAD_ROOTS.some((root) => path.startsWith(root));
}

export function decideTestsScope(changedPaths) {
  if (changedPaths === null) {
    return { testsNeeded: true, reason: "could not determine the changed paths" };
  }
  if (changedPaths.length === 0) {
    return { testsNeeded: true, reason: "no changed path was reported" };
  }

  const readPath = changedPaths.find((path) => !isUnreadByTests(path));
  if (readPath !== undefined) {
    return { testsNeeded: true, reason: `${readPath} is read by the test shards` };
  }
  return { testsNeeded: false, reason: "no changed path is read by the test shards" };
}

const CATALOG_INPUT_ROOTS = ["packages/ui/"];

const CATALOG_INPUT_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".node-version",
  "vitest.config.ts",
  "tsconfig.json",
  ".github/workflows/verify.yml",
  ".github/scripts/slow-tests-reporter.mjs",
  ".github/scripts/without-package-output.mjs",
]);

export function isCatalogInput(path) {
  return CATALOG_INPUT_FILES.has(path) || CATALOG_INPUT_ROOTS.some((root) => path.startsWith(root));
}

export function decideCatalogScope(changedPaths) {
  if (changedPaths === null) {
    return { catalogChanged: true, reason: "could not determine the changed paths" };
  }
  if (changedPaths.length === 0) {
    return { catalogChanged: true, reason: "no changed path was reported" };
  }

  const catalogInputPath = changedPaths.find((path) => isCatalogInput(path));
  if (catalogInputPath !== undefined) {
    return { catalogChanged: true, reason: `${catalogInputPath} can change the catalog` };
  }
  return { catalogChanged: false, reason: "no changed path can change the catalog" };
}

export async function diffChangedPaths({ fromSha, toSha, runGit }) {
  try {
    const stdout = await runGit(["diff", "--name-only", "--no-renames", fromSha, toSha]);
    return stdout.split("\n").filter((line) => line !== "");
  } catch {
    return null;
  }
}

async function runGitViaChildProcess(args) {
  const { stdout } = await promisify(execFile)("git", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function runCli({
  env = process.env,
  runGit = runGitViaChildProcess,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { SCOPE_FROM, SCOPE_TO, GITHUB_OUTPUT } = env;
  if (!GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: GITHUB_OUTPUT is required`);
    return 1;
  }

  if (!SCOPE_FROM || !SCOPE_TO || SCOPE_FROM === NULL_SHA) {
    log(`${LOG_PREFIX}: SCOPE_FROM or SCOPE_TO is missing or unresolved`);
    await appendOutput(GITHUB_OUTPUT, "docs_only=false\n");
    await appendOutput(GITHUB_OUTPUT, "catalog_changed=true\n");
    await appendOutput(GITHUB_OUTPUT, "tests_needed=true\n");
    return 0;
  }

  const changedPaths = await diffChangedPaths({ fromSha: SCOPE_FROM, toSha: SCOPE_TO, runGit });
  const scopeDecision = decideScope(changedPaths);
  const catalogDecision = decideCatalogScope(changedPaths);
  const testsDecision = decideTestsScope(changedPaths);
  log(`${LOG_PREFIX}: ${scopeDecision.reason}`);
  log(`${LOG_PREFIX}: ${catalogDecision.reason}`);
  log(`${LOG_PREFIX}: ${testsDecision.reason}`);
  await appendOutput(GITHUB_OUTPUT, `docs_only=${scopeDecision.docsOnly}\n`);
  await appendOutput(GITHUB_OUTPUT, `catalog_changed=${catalogDecision.catalogChanged}\n`);
  await appendOutput(GITHUB_OUTPUT, `tests_needed=${testsDecision.testsNeeded}\n`);
  return 0;
}

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
