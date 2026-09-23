// Picks the commit a staging deploy ships: the newest commit on main's first-parent history whose
// Verify push run passed. Deploying that instead of the triggering commit means a deploy run that
// GitHub cancels while pending loses nothing, and staging never moves back to an older commit.

import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";

const LOG_PREFIX = "newest-verified-commit";

/**
 * @param {object} input
 * @param {string[]} input.history - main's first-parent commits, newest first.
 * @param {Set<string>} input.verifiedShas - commits whose Verify push run passed.
 * @returns {string | null}
 */
export function newestVerifiedCommit({ history, verifiedShas }) {
  return history.find((sha) => verifiedShas.has(sha)) ?? null;
}

/** The head commits of the successful push runs in a GitHub "list workflow runs" response. */
export function verifiedShasFromRuns(body) {
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
  return new Set(
    runs
      .filter((run) => run.conclusion === "success" && run.event === "push")
      .map((run) => run.head_sha),
  );
}

/**
 * @param {string} ref
 * @param {(args: string[]) => Promise<string>} runGit - runs `git` and resolves its stdout.
 * @returns {Promise<string[]>}
 */
export async function readFirstParentHistory(ref, runGit) {
  const stdout = await runGit(["rev-list", "--first-parent", ref]);
  return stdout.split("\n").filter((line) => line !== "");
}

/**
 * @param {{ repository: string, token: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<Set<string>>}
 */
export async function fetchVerifiedShas({ repository, token, fetchImpl = fetch }) {
  const url = new URL(
    `https://api.github.com/repos/${repository}/actions/workflows/verify.yml/runs`,
  );
  url.search = new URLSearchParams({
    branch: "main",
    event: "push",
    status: "success",
    per_page: "100",
  }).toString();

  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`${LOG_PREFIX}: listing Verify runs returned status ${response.status}`);
  }
  return verifiedShasFromRuns(await response.json());
}

async function runGitViaChildProcess(args) {
  const { stdout } = await promisify(execFile)("git", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/** @returns {Promise<number>} the process exit code. */
export async function runCli({
  env = process.env,
  runGit = runGitViaChildProcess,
  fetchImpl = fetch,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, TRIGGERING_SHA, GITHUB_OUTPUT } = env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !TRIGGERING_SHA || !GITHUB_OUTPUT) {
    logError(
      `${LOG_PREFIX}: GITHUB_TOKEN, GITHUB_REPOSITORY, TRIGGERING_SHA and GITHUB_OUTPUT are required`,
    );
    return 1;
  }

  const history = await readFirstParentHistory("HEAD", runGit);
  const verifiedShas = await fetchVerifiedShas({
    repository: GITHUB_REPOSITORY,
    token: GITHUB_TOKEN,
    fetchImpl,
  });
  // The triggering run's payload already proves this commit passed; the runs listing may lag.
  verifiedShas.add(TRIGGERING_SHA);

  const target = newestVerifiedCommit({ history, verifiedShas });
  if (target === null) {
    logError(
      `${LOG_PREFIX}: no commit on main's first-parent history passed verification (triggered by ${TRIGGERING_SHA})`,
    );
    return 1;
  }

  log(
    `${LOG_PREFIX}: newest verified commit on main is ${target} (triggered by ${TRIGGERING_SHA})`,
  );
  await appendOutput(GITHUB_OUTPUT, `sha=${target}\n`);
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
