import { appendFile } from "node:fs/promises";

const LOG_PREFIX = "previous-commit-verified";
const NULL_SHA = "0".repeat(40);

function newestRun(runs) {
  return runs.reduce(
    (newest, run) => (newest === null || run.created_at > newest.created_at ? run : newest),
    null,
  );
}

export function decideSkipAllowed({ eventName, previousSha, runs }) {
  if (eventName === "pull_request") {
    return { skipAllowed: true, reason: "a pull request is judged by its own scope" };
  }
  if (eventName !== "push") {
    return { skipAllowed: false, reason: `a ${eventName} run runs every job in full` };
  }
  if (!previousSha || previousSha === NULL_SHA) {
    return { skipAllowed: false, reason: "the push names no previous commit" };
  }
  if (runs === null) {
    return { skipAllowed: false, reason: `the Verify runs of ${previousSha} could not be read` };
  }

  const run = newestRun(
    runs.filter(
      (candidate) =>
        candidate.head_sha === previousSha &&
        candidate.event === "push" &&
        candidate.head_branch === "main",
    ),
  );
  if (run === null) {
    return { skipAllowed: false, reason: `${previousSha} has no Verify run on main` };
  }
  if (run.status !== "completed") {
    return {
      skipAllowed: false,
      reason: `${previousSha}'s Verify run ${run.id} has not finished (${run.status})`,
    };
  }
  if (run.conclusion !== "success") {
    return {
      skipAllowed: false,
      reason: `${previousSha}'s Verify run ${run.id} concluded ${run.conclusion}`,
    };
  }
  return { skipAllowed: true, reason: `${previousSha}'s Verify run ${run.id} succeeded` };
}

export async function fetchPreviousCommitRuns({
  repository,
  token,
  previousSha,
  fetchImpl = fetch,
}) {
  const url = new URL(
    `https://api.github.com/repos/${repository}/actions/workflows/verify.yml/runs`,
  );
  url.search = new URLSearchParams({
    head_sha: previousSha,
    branch: "main",
    event: "push",
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
    throw new Error(`listing Verify runs returned status ${response.status}`);
  }
  const body = await response.json();
  if (!Array.isArray(body?.workflow_runs)) {
    throw new Error("listing Verify runs returned no run list");
  }
  return body.workflow_runs;
}

export async function runCli({
  env = process.env,
  fetchImpl = fetch,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { EVENT_NAME, PREVIOUS_SHA, GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT } = env;
  if (!GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: GITHUB_OUTPUT is required`);
    return 1;
  }

  let runs = null;
  const needsRuns = EVENT_NAME === "push" && PREVIOUS_SHA && PREVIOUS_SHA !== NULL_SHA;
  if (needsRuns && (!GITHUB_TOKEN || !GITHUB_REPOSITORY)) {
    logError(`${LOG_PREFIX}: GITHUB_TOKEN and GITHUB_REPOSITORY are required on a push`);
  } else if (needsRuns) {
    try {
      runs = await fetchPreviousCommitRuns({
        repository: GITHUB_REPOSITORY,
        token: GITHUB_TOKEN,
        previousSha: PREVIOUS_SHA,
        fetchImpl,
      });
    } catch (error) {
      logError(`${LOG_PREFIX}: ${error.message}`);
    }
  }

  const decision = decideSkipAllowed({ eventName: EVENT_NAME, previousSha: PREVIOUS_SHA, runs });
  log(`${LOG_PREFIX}: ${decision.reason}`);
  await appendOutput(GITHUB_OUTPUT, `skip_allowed=${decision.skipAllowed}\n`);
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
