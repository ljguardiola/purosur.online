// Lists Verify's push runs on main with how long each one took, so its duration can be followed
// across runs without adding a CI job for it: run locally with `pnpm ci:verify-durations`.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const LOG_PREFIX = "verify-durations";
const RUNS_ENDPOINT =
  "repos/{owner}/{repo}/actions/workflows/verify.yml/runs?branch=main&event=push&status=completed&per_page=100";

/**
 * One row per completed run in a GitHub "list workflow runs" response, in the API's order
 * (newest first). A run missing either timestamp, or not yet completed, has no known duration
 * and is left out.
 *
 * @returns {Array<{ sha: string, startedAt: string, durationSeconds: number, conclusion: string, attempt: number, url: string }>}
 */
export function durationsFromRuns(body) {
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
  return runs
    .filter((run) => run.status === "completed" && run.run_started_at && run.updated_at)
    .map((run) => ({
      sha: run.head_sha.slice(0, 7),
      startedAt: run.run_started_at,
      durationSeconds: Math.round(
        (Date.parse(run.updated_at) - Date.parse(run.run_started_at)) / 1000,
      ),
      conclusion: run.conclusion,
      attempt: run.run_attempt,
      url: run.html_url,
    }));
}

function formatDuration(durationSeconds) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatStartedAt(startedAt) {
  return `${new Date(startedAt).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

/** A plain-text table of rows, readable in a terminal. */
export function formatDurationsTable(rows) {
  if (rows.length === 0) {
    return "No completed Verify runs on main.";
  }

  const lines = rows.map((row) => {
    const attempt = row.attempt > 1 ? ` (attempt ${row.attempt})` : "";
    return `${formatStartedAt(row.startedAt)}  ${row.sha}  ${formatDuration(row.durationSeconds).padStart(5)}  ${row.conclusion}${attempt}  ${row.url}`;
  });
  const header = "STARTED (UTC)     COMMIT   DURATION  CONCLUSION  URL";
  return [header, ...lines].join("\n");
}

async function runGhViaChildProcess(args) {
  const { stdout } = await promisify(execFile)("gh", args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/** @returns {Promise<number>} the process exit code. */
export async function runCli({
  runGh = runGhViaChildProcess,
  log = console.log,
  logError = console.error,
} = {}) {
  let stdout;
  try {
    stdout = await runGh(["api", RUNS_ENDPOINT]);
  } catch (error) {
    logError(`${LOG_PREFIX}: gh api failed: ${error.message}`);
    return 1;
  }

  let body;
  try {
    body = JSON.parse(stdout);
  } catch (error) {
    logError(`${LOG_PREFIX}: gh api returned output that is not valid JSON: ${error.message}`);
    return 1;
  }

  log(formatDurationsTable(durationsFromRuns(body)));
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
