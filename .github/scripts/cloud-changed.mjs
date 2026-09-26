// Decides whether a push to main changed anything the cloud image or the staging
// infrastructure is built from. When it did not, the build and deploy jobs skip their work;
// when in doubt (a re-run, a previous run that did not succeed, an unrecognized path, an
// unreachable staging domain or GitHub API, an unusable diff), it deploys — a missed skip costs
// one pipeline run, a wrongful skip leaves staging stale.

import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";
import { buildHealthUrl, fetchHealth, MAX_REQUEST_TIMEOUT_MS } from "./verify-cloud-health.mjs";

const LOG_PREFIX = "cloud-changed";
const SHA_RE = /^[0-9a-f]{40}$/i;

// Tailwind scans every non-CSS file under its source roots, Markdown included, so a `.md` file
// there can change the CSS the cloud image serves.
const CLOUD_SOURCE_ROOTS = ["apps/cloud/", "apps/backoffice/", "packages/"];

/** Denylist, conservative: a path this does not recognize is treated as relevant. */
export function isIrrelevantToCloud(path) {
  if (path.startsWith("apps/pos/")) return true;
  if (path.endsWith(".md") && !CLOUD_SOURCE_ROOTS.some((root) => path.startsWith(root))) {
    return true;
  }
  if (path === ".claude" || path.startsWith(".claude/")) return true;
  if (path.startsWith(".github/")) {
    if (path === ".github/workflows/deploy-cloud-staging.yml") return false;
    if (path.startsWith(".github/scripts/") && !path.endsWith(".test.mjs")) return false;
    return true;
  }
  return false;
}

const WELL_ENDED_CONCLUSIONS = new Set(["success"]);

// A re-run keeps the run's created_at; run_started_at moves to the latest attempt, which is the
// one whose conclusion the listing reports.
function latestAttemptStart(run) {
  return Date.parse(run.run_started_at ?? run.created_at);
}

/**
 * Whether the previous completed run of this workflow forces a deploy, whatever staging
 * reports: a run that failed after rolling out its image, or a pending run cancelled before it
 * applied, leaves staging's version unreliable as proof that everything since was applied.
 * Skipped runs (a failed Verify push) did nothing, so they can neither prove nor hide that.
 * @param {{ body: unknown, currentRunId: number }} input - body is a "list workflow runs" response.
 * @returns {{ deploy: boolean, reason: string }}
 */
export function previousRunVerdict({ body, currentRunId }) {
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
  const previous = runs
    .filter((run) => run.id !== currentRunId && run.conclusion !== "skipped")
    .sort((a, b) => latestAttemptStart(b) - latestAttemptStart(a))[0];

  if (previous === undefined) {
    return { deploy: true, reason: "no previous completed run of this workflow was found" };
  }
  if (!WELL_ENDED_CONCLUSIONS.has(previous.conclusion)) {
    return {
      deploy: true,
      reason: `previous run ${previous.id} ended in ${previous.conclusion}`,
    };
  }
  return {
    deploy: false,
    reason: `previous run ${previous.id} ended in ${previous.conclusion}`,
  };
}

/**
 * @param {{ repository: string, token: string, currentRunId: number, fetchImpl?: typeof fetch }} options
 * @returns {Promise<{ deploy: boolean, reason: string }>} a deploy verdict when the lookup fails.
 */
export async function fetchPreviousRunVerdict({
  repository,
  token,
  currentRunId,
  fetchImpl = fetch,
}) {
  const url = new URL(
    `https://api.github.com/repos/${repository}/actions/workflows/deploy-cloud-staging.yml/runs`,
  );
  url.search = new URLSearchParams({ status: "completed", per_page: "30" }).toString();

  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(MAX_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        deploy: true,
        reason: `listing this workflow's runs returned status ${response.status}`,
      };
    }
    return previousRunVerdict({ body: await response.json(), currentRunId });
  } catch (error) {
    return {
      deploy: true,
      reason: `listing this workflow's runs failed: ${error instanceof Error ? error.message : error}`,
    };
  }
}

/**
 * @param {object} input
 * @param {string} input.targetSha
 * @param {string | null} input.stagingVersion - what staging's /health reports, or null.
 * @param {boolean} input.stagingIsAncestor - whether stagingVersion is an ancestor of targetSha.
 * @param {string[] | null} input.changedPaths - null when git could not produce the diff.
 * @returns {{ deploy: boolean, reason: string }}
 */
export function decideDeploy({ targetSha, stagingVersion, stagingIsAncestor, changedPaths }) {
  const stagingIsSha = typeof stagingVersion === "string" && SHA_RE.test(stagingVersion);

  if (!stagingIsSha) {
    return {
      deploy: true,
      reason: `staging reports version ${JSON.stringify(stagingVersion)}, not a commit SHA`,
    };
  }
  if (!stagingIsAncestor) {
    return {
      deploy: true,
      reason: `staging's commit ${stagingVersion} is not an ancestor of ${targetSha}`,
    };
  }
  if (changedPaths === null) {
    return {
      deploy: true,
      reason: `could not diff staging's commit ${stagingVersion} against ${targetSha}`,
    };
  }

  const relevantPath = changedPaths.find((path) => !isIrrelevantToCloud(path));
  if (relevantPath !== undefined) {
    return {
      deploy: true,
      reason: `${relevantPath} changed since staging's commit ${stagingVersion}`,
    };
  }
  return {
    deploy: false,
    reason: `no cloud-relevant path changed since staging's commit ${stagingVersion}`,
  };
}

/**
 * @param {{ domain: string, fetchImpl?: typeof fetch, log?: (message: string) => void }} options
 * @returns {Promise<string | null>} the commit SHA staging reports, or null when unusable.
 */
export async function fetchStagingVersion({ domain, fetchImpl, log }) {
  const result = await fetchHealth(buildHealthUrl(domain), {
    fetchImpl,
    requestTimeoutMs: MAX_REQUEST_TIMEOUT_MS,
    log,
  });
  const version =
    result?.status === 200 && typeof result.body === "object" && result.body !== null
      ? result.body.version
      : undefined;
  return typeof version === "string" ? version : null;
}

/**
 * @param {{ ancestorSha: string, targetSha: string, runGit: (args: string[]) => Promise<string> }} options
 * @returns {Promise<boolean>}
 */
export async function isAncestor({ ancestorSha, targetSha, runGit }) {
  try {
    await runGit(["merge-base", "--is-ancestor", ancestorSha, targetSha]);
    return true;
  } catch {
    return false;
  }
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
  fetchImpl = fetch,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const {
    CLOUD_HEALTH_DOMAIN,
    TARGET_SHA,
    FORCE_DEPLOY,
    RUN_ATTEMPT,
    GITHUB_OUTPUT,
    GITHUB_TOKEN,
    GITHUB_REPOSITORY,
    GITHUB_RUN_ID,
  } = env;
  if (
    !CLOUD_HEALTH_DOMAIN ||
    !TARGET_SHA ||
    !GITHUB_OUTPUT ||
    !GITHUB_TOKEN ||
    !GITHUB_REPOSITORY ||
    !GITHUB_RUN_ID
  ) {
    logError(
      `${LOG_PREFIX}: CLOUD_HEALTH_DOMAIN, TARGET_SHA, GITHUB_OUTPUT, GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_RUN_ID are required`,
    );
    return 1;
  }

  if (FORCE_DEPLOY === "true") {
    log(`${LOG_PREFIX}: forced deploy of ${TARGET_SHA}`);
    await appendOutput(GITHUB_OUTPUT, "deploy=true\n");
    return 0;
  }
  // A re-run is how a failed deploy is retried, and staging may already report its commit.
  if (Number(RUN_ATTEMPT) > 1) {
    log(`${LOG_PREFIX}: re-run (attempt ${RUN_ATTEMPT}) deploys ${TARGET_SHA}`);
    await appendOutput(GITHUB_OUTPUT, "deploy=true\n");
    return 0;
  }

  const previousRun = await fetchPreviousRunVerdict({
    repository: GITHUB_REPOSITORY,
    token: GITHUB_TOKEN,
    currentRunId: Number(GITHUB_RUN_ID),
    fetchImpl,
  });
  if (previousRun.deploy) {
    log(`${LOG_PREFIX}: ${previousRun.reason}`);
    await appendOutput(GITHUB_OUTPUT, "deploy=true\n");
    return 0;
  }

  const stagingVersion = await fetchStagingVersion({ domain: CLOUD_HEALTH_DOMAIN, fetchImpl, log });
  const stagingIsSha = typeof stagingVersion === "string" && SHA_RE.test(stagingVersion);
  const stagingIsAncestor = stagingIsSha
    ? await isAncestor({ ancestorSha: stagingVersion, targetSha: TARGET_SHA, runGit })
    : false;
  const changedPaths = stagingIsAncestor
    ? await diffChangedPaths({ fromSha: stagingVersion, toSha: TARGET_SHA, runGit })
    : null;

  const decision = decideDeploy({
    targetSha: TARGET_SHA,
    stagingVersion,
    stagingIsAncestor,
    changedPaths,
  });
  log(`${LOG_PREFIX}: ${decision.reason}`);
  await appendOutput(GITHUB_OUTPUT, `deploy=${decision.deploy}\n`);
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
