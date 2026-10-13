import { execFile } from "node:child_process";
import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { encodeDurations, readDurations } from "./test-durations.mjs";

const LOG_PREFIX = "test-durations-source";
const ARTIFACT_PREFIX = "test-durations-shard-";
const DOWNLOAD_TIMEOUT_MS = 90_000;
// The shards receive the payload as one environment variable, and Linux refuses to start a
// process with a single environment string over 128 KiB.
const MAX_PAYLOAD_BYTES = 96 * 1024;

export async function findRunWithDurations({ runs, listArtifacts }) {
  for (const run of runs) {
    const artifacts = await listArtifacts(run.id);
    if (artifacts.some((a) => !a.expired && a.name.startsWith(ARTIFACT_PREFIX))) {
      return run.id;
    }
  }
  return null;
}

export async function downloadDurations(
  runId,
  { repository, token, dir, execFileImpl = promisify(execFile) },
) {
  await execFileImpl(
    "gh",
    [
      "run",
      "download",
      String(runId),
      "--repo",
      repository,
      "--pattern",
      `${ARTIFACT_PREFIX}*`,
      "--dir",
      dir,
    ],
    { env: { ...process.env, GH_TOKEN: token }, timeout: DOWNLOAD_TIMEOUT_MS },
  );
  return readDurations(dir);
}

function newestRun(runs) {
  return runs
    .filter((run) => run !== null)
    .reduce(
      (newest, run) => (newest === null || run.created_at > newest.created_at ? run : newest),
      null,
    );
}

function apiGetter({ token, fetchImpl }) {
  return async (url) => {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(`${url} returned status ${response.status}`);
    }
    return response.json();
  };
}

export async function runCli({
  env = process.env,
  fetchImpl = fetch,
  download = async (runId) =>
    downloadDurations(runId, {
      repository: env.GITHUB_REPOSITORY,
      token: env.GITHUB_TOKEN,
      dir: await mkdtemp(join(env.RUNNER_TEMP ?? tmpdir(), "test-durations-")),
    }),
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT, HEAD_BRANCH } = env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_OUTPUT are required`);
    return 1;
  }

  const get = apiGetter({ token: GITHUB_TOKEN, fetchImpl });
  const base = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions`;
  let runId = null;
  try {
    const sources = [{ branch: "main", event: "push", keep: () => true }];
    if (HEAD_BRANCH) {
      sources.push({
        branch: HEAD_BRANCH,
        event: "pull_request",
        keep: (run) => run.head_repository?.full_name === GITHUB_REPOSITORY,
      });
    }
    const listArtifacts = async (id) => (await get(`${base}/runs/${id}/artifacts`)).artifacts ?? [];
    const found = [];
    for (const { branch, event, keep } of sources) {
      const runsUrl = new URL(`${base}/workflows/verify.yml/runs`);
      runsUrl.search = new URLSearchParams({
        branch,
        event,
        status: "success",
        per_page: "10",
      }).toString();
      const body = await get(runsUrl.toString());
      const runs = (Array.isArray(body?.workflow_runs) ? body.workflow_runs : []).filter(keep);
      const id = await findRunWithDurations({ runs, listArtifacts });
      found.push(runs.find((run) => run.id === id) ?? null);
    }
    runId = newestRun(found)?.id ?? null;
  } catch (error) {
    logError(`${LOG_PREFIX}: warning, shards split by file count: ${error.message}`);
  }

  let payload = "";
  if (runId === null) {
    log(`${LOG_PREFIX}: no run to take durations from, shards split by file count`);
  } else {
    try {
      payload = encodeDurations(await download(runId));
      if (payload.length > MAX_PAYLOAD_BYTES) {
        logError(
          `${LOG_PREFIX}: warning, shards split by file count: run ${runId}'s durations are too large to hand to them (${payload.length} bytes encoded)`,
        );
        payload = "";
      } else {
        log(`${LOG_PREFIX}: shards split by the durations of run ${runId}`);
      }
    } catch (error) {
      logError(
        `${LOG_PREFIX}: warning, shards split by file count: downloading run ${runId}'s durations failed: ${error.message}`,
      );
    }
  }

  await appendOutput(GITHUB_OUTPUT, `durations=${payload}\n`);
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
