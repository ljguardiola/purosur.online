// Decides whether a change is made only of Markdown documentation, so the verify workflow can
// skip its slow steps for it while the required check still runs and reports on the pull
// request in about a minute.

import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";

const LOG_PREFIX = "change-scope";
const ALL_ZEROS_RE = /^0+$/;

// Tailwind scans every non-CSS file under its source roots, Markdown included, and
// `.github/pull_request_template.md` feeds the pull request contract, so a `.md` file under any
// of these roots still needs the full verification.
const NON_DOCS_ROOTS = ["apps/", "packages/", ".github/"];

/** @returns {boolean} whether path is a Markdown file outside every root the full verification still reads. */
export function isDocumentationOnly(path) {
  return path.endsWith(".md") && !NON_DOCS_ROOTS.some((root) => path.startsWith(root));
}

/**
 * @param {string[] | null} changedPaths - null when git could not produce the diff.
 * @returns {{ docsOnly: boolean, reason: string }}
 */
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

/**
 * @param {{ fromSha: string, toSha: string, runGit: (args: string[]) => Promise<string> }} options
 * @returns {Promise<string[] | null>} null when git could not produce the diff.
 */
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

/** @returns {Promise<number>} the process exit code. */
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

  // A push that created the branch has no earlier commit: GitHub reports `before` as 40 zeros.
  if (!SCOPE_FROM || !SCOPE_TO || ALL_ZEROS_RE.test(SCOPE_FROM)) {
    log(`${LOG_PREFIX}: SCOPE_FROM or SCOPE_TO is missing, or this push created the branch`);
    await appendOutput(GITHUB_OUTPUT, "docs_only=false\n");
    return 0;
  }

  const changedPaths = await diffChangedPaths({ fromSha: SCOPE_FROM, toSha: SCOPE_TO, runGit });
  const decision = decideScope(changedPaths);
  log(`${LOG_PREFIX}: ${decision.reason}`);
  await appendOutput(GITHUB_OUTPUT, `docs_only=${decision.docsOnly}\n`);
  return 0;
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === new URL(import.meta.url).pathname;
if (isMainModule) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
