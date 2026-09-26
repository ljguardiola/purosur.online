import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";

const LOG_PREFIX = "change-scope";

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

  if (!SCOPE_FROM || !SCOPE_TO) {
    log(`${LOG_PREFIX}: SCOPE_FROM or SCOPE_TO is missing`);
    await appendOutput(GITHUB_OUTPUT, "docs_only=false\n");
    return 0;
  }

  const changedPaths = await diffChangedPaths({ fromSha: SCOPE_FROM, toSha: SCOPE_TO, runGit });
  const decision = decideScope(changedPaths);
  log(`${LOG_PREFIX}: ${decision.reason}`);
  await appendOutput(GITHUB_OUTPUT, `docs_only=${decision.docsOnly}\n`);
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
