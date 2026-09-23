// Deploys start when the Verify workflow_run completes, so two close merges can finish
// verification out of order. This guard asks staging which version it already serves and skips
// the rest of the deploy job (success, not failure) when staging already serves a commit that
// contains the candidate, so an older commit never rolls staging back.

import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";
import { buildHealthUrl, fetchHealth, MAX_REQUEST_TIMEOUT_MS } from "./verify-cloud-health.mjs";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export function isCommitSha(value) {
  return typeof value === "string" && COMMIT_SHA_PATTERN.test(value);
}

/**
 * @param {object} input
 * @param {string} input.candidateSha - the commit this run would deploy.
 * @param {string | null} input.stagingVersion - the version staging's /health reports, or null
 *   when that could not be read.
 * @param {boolean} [input.isAncestor] - whether `candidateSha` is an ancestor of
 *   `stagingVersion` in git history. Ignored unless `stagingVersion` is a distinct commit SHA.
 * @returns {{ deploy: boolean, reason: string }}
 */
export function decideDeployAction({ candidateSha, stagingVersion, isAncestor = false }) {
  if (!isCommitSha(stagingVersion)) {
    return {
      deploy: true,
      reason: `staging's reported version is unreachable or not a commit SHA (${JSON.stringify(stagingVersion)}); deploying`,
    };
  }
  if (stagingVersion === candidateSha) {
    return {
      deploy: true,
      reason: `staging already serves the candidate commit ${candidateSha}; deploying converges a possibly failed apply`,
    };
  }
  if (isAncestor) {
    return {
      deploy: false,
      reason: `staging already serves ${stagingVersion}, which contains candidate ${candidateSha}; skipping to avoid rolling staging back`,
    };
  }
  return {
    deploy: true,
    reason: `candidate ${candidateSha} is not a known ancestor of staging's ${stagingVersion}; deploying`,
  };
}

/**
 * @param {string} candidateSha
 * @param {string} deployedSha
 * @param {(args: string[]) => Promise<number>} runGit - runs `git` with the given args and
 *   resolves its exit status.
 * @returns {Promise<boolean>} true only when git confirms candidateSha is an ancestor of
 *   deployedSha (exit 0); any other exit status, including one meaning git does not know the
 *   staging commit, is treated as "not an ancestor".
 */
export async function isAncestorOf(candidateSha, deployedSha, runGit) {
  const status = await runGit(["merge-base", "--is-ancestor", candidateSha, deployedSha]);
  return status === 0;
}

function extractStagingVersion(result) {
  const body = result?.body;
  if (result?.status !== 200 || typeof body !== "object" || body === null) {
    return null;
  }
  return typeof body.version === "string" ? body.version : null;
}

async function runGitViaChildProcess(args) {
  try {
    await promisify(execFile)("git", args);
    return 0;
  } catch (error) {
    return typeof error.code === "number" ? error.code : 1;
  }
}

async function runCli() {
  const domain = process.env.CLOUD_HEALTH_DOMAIN;
  const candidateSha = process.env.DEPLOY_SHA;
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!domain || !candidateSha || !githubOutput) {
    console.error("deploy-order: CLOUD_HEALTH_DOMAIN, DEPLOY_SHA and GITHUB_OUTPUT are required");
    process.exit(1);
    return;
  }

  const url = buildHealthUrl(domain);
  const result = await fetchHealth(url, { requestTimeoutMs: MAX_REQUEST_TIMEOUT_MS });
  const stagingVersion = extractStagingVersion(result);

  const isAncestor =
    isCommitSha(stagingVersion) && stagingVersion !== candidateSha
      ? await isAncestorOf(candidateSha, stagingVersion, runGitViaChildProcess)
      : false;

  const decision = decideDeployAction({ candidateSha, stagingVersion, isAncestor });
  console.log(`deploy-order: ${decision.reason}`);

  await appendFile(githubOutput, `deploy=${decision.deploy}\n`);
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === new URL(import.meta.url).pathname;
if (isMainModule) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
