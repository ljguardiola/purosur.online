import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";

const LOG_PREFIX = "newest-verified-commit";

export function newestVerifiedCommit({ history, verifiedShas }) {
  return history.find((sha) => verifiedShas.has(sha)) ?? null;
}

export function verifiedShasFromRuns(body) {
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
  return new Set(
    runs
      .filter((run) => run.conclusion === "success" && run.event === "push")
      .map((run) => run.head_sha),
  );
}

export async function readFirstParentHistory(ref, runGit) {
  const stdout = await runGit(["rev-list", "--first-parent", ref]);
  return stdout.split("\n").filter((line) => line !== "");
}

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

export async function runCli({
  env = process.env,
  runGit = runGitViaChildProcess,
  fetchImpl = fetch,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, TRIGGERING_SHA, GITHUB_OUTPUT } = env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_OUTPUT are required`);
    return 1;
  }

  const history = await readFirstParentHistory("HEAD", runGit);
  const verifiedShas = await fetchVerifiedShas({
    repository: GITHUB_REPOSITORY,
    token: GITHUB_TOKEN,
    fetchImpl,
  });
  // workflow_dispatch has no triggering run to add here; for a push, the triggering run's payload
  // already proves this commit passed even if the runs listing hasn't caught up yet.
  if (TRIGGERING_SHA) {
    verifiedShas.add(TRIGGERING_SHA);
  }

  const target = newestVerifiedCommit({ history, verifiedShas });
  const trigger = TRIGGERING_SHA ? `triggered by ${TRIGGERING_SHA}` : "manual dispatch";
  if (target === null) {
    logError(
      `${LOG_PREFIX}: no commit on main's first-parent history passed verification (${trigger})`,
    );
    return 1;
  }

  log(`${LOG_PREFIX}: newest verified commit on main is ${target} (${trigger})`);
  await appendOutput(GITHUB_OUTPUT, `sha=${target}\n`);
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
