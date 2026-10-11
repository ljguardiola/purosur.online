import { appendFile } from "node:fs/promises";

const LOG_PREFIX = "test-durations-source";
const ARTIFACT_PREFIX = "test-durations-shard-";

export async function findRunWithDurations({ runs, listArtifacts }) {
  for (const run of runs) {
    const artifacts = await listArtifacts(run.id);
    if (artifacts.some((a) => !a.expired && a.name.startsWith(ARTIFACT_PREFIX))) {
      return run.id;
    }
  }
  return null;
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
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT } = env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_OUTPUT are required`);
    return 1;
  }

  const get = apiGetter({ token: GITHUB_TOKEN, fetchImpl });
  const base = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions`;
  let runId = null;
  try {
    const runsUrl = new URL(`${base}/workflows/verify.yml/runs`);
    runsUrl.search = new URLSearchParams({
      branch: "main",
      event: "push",
      status: "success",
      per_page: "10",
    }).toString();
    const body = await get(runsUrl.toString());
    runId = await findRunWithDurations({
      runs: Array.isArray(body?.workflow_runs) ? body.workflow_runs : [],
      listArtifacts: async (id) => (await get(`${base}/runs/${id}/artifacts`)).artifacts ?? [],
    });
  } catch (error) {
    logError(`${LOG_PREFIX}: warning, shards fall back to even counts: ${error.message}`);
  }

  log(`${LOG_PREFIX}: ${runId === null ? "no run to take durations from" : `using run ${runId}`}`);
  await appendOutput(GITHUB_OUTPUT, `run_id=${runId ?? ""}\n`);
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
