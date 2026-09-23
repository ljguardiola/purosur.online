// Decides whether a push to main changed anything the cloud image or the staging
// infrastructure is built from. When it did not, the build and deploy jobs skip their work;
// when in doubt (an unrecognized path, an unreachable staging domain, an unusable diff), it
// deploys — a missed skip costs one pipeline run, a wrongful skip leaves staging stale.

import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";
import { buildHealthUrl, fetchHealth, MAX_REQUEST_TIMEOUT_MS } from "./verify-cloud-health.mjs";

const LOG_PREFIX = "cloud-changed";
const SHA_RE = /^[0-9a-f]{40}$/i;

function isDirectChildOf(path, dir) {
  return path.startsWith(dir) && !path.slice(dir.length).includes("/");
}

/** Denylist, conservative: a path this does not recognize is treated as relevant. */
export function isIrrelevantToCloud(path) {
  if (path.startsWith("apps/pos/")) return true;
  if (path.endsWith(".md")) return true;
  if (path === ".claude" || path.startsWith(".claude/")) return true;
  if (path.startsWith(".github/")) {
    if (path === ".github/workflows/deploy-cloud-staging.yml") return false;
    if (
      isDirectChildOf(path, ".github/scripts/") &&
      path.endsWith(".mjs") &&
      !path.endsWith(".test.mjs")
    ) {
      return false;
    }
    return true;
  }
  return false;
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
    const stdout = await runGit(["diff", "--name-only", fromSha, toSha]);
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
  const { CLOUD_HEALTH_DOMAIN, TARGET_SHA, FORCE_DEPLOY, GITHUB_OUTPUT } = env;
  if (!CLOUD_HEALTH_DOMAIN || !TARGET_SHA || !GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: CLOUD_HEALTH_DOMAIN, TARGET_SHA and GITHUB_OUTPUT are required`);
    return 1;
  }

  if (FORCE_DEPLOY === "true") {
    log(`${LOG_PREFIX}: forced deploy of ${TARGET_SHA}`);
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
