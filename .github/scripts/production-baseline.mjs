import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";
import { parseDeploymentListOutput } from "./railway-deployment-wait.mjs";
import { releaseTagsNewestFirst } from "./release-version.mjs";
import { buildHealthUrl, fetchHealth, MAX_REQUEST_TIMEOUT_MS } from "./verify-cloud-health.mjs";

const LOG_PREFIX = "production-baseline";
const SHA_RE = /^[0-9a-f]{40}$/;
export const DEPLOYMENT_LIST_LIMIT = 1000;

function reportedVersion(health) {
  const version =
    health?.status === 200 && typeof health.body === "object" && health.body !== null
      ? health.body.version
      : undefined;
  return typeof version === "string" && SHA_RE.test(version) ? version : null;
}

function describeHealth(health) {
  if (!health) return "did not answer";
  if (health.status !== 200) return `answered status ${health.status}`;
  return `reported version ${JSON.stringify(health.body?.version)}, not a commit`;
}

export function decideBaseline({ deploymentList, health, tagsAtVersion = [], prefix }) {
  if (deploymentList.error !== null) {
    return {
      refused: true,
      reason: `could not list production's deployments: ${deploymentList.error}`,
    };
  }
  if (deploymentList.deployments.length === 0) {
    return {
      refused: false,
      tag: null,
      reason: "production has never been deployed, so no release runs there",
    };
  }
  const version = reportedVersion(health);
  if (version === null) {
    return {
      refused: true,
      reason: `production has deployments but its health ${describeHealth(health)}`,
    };
  }
  const [tag] = releaseTagsNewestFirst(tagsAtVersion, prefix);
  if (tag === undefined) {
    return {
      refused: true,
      reason: `production serves ${version}, which no ${prefix} release tag points at`,
    };
  }
  return { refused: false, tag, reason: `production serves ${version}, released as ${tag}` };
}

async function runRailwayViaChildProcess(args) {
  try {
    const { stdout } = await promisify(execFile)("railway", args);
    return { exitOk: true, stdout };
  } catch (error) {
    return {
      exitOk: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? String(error.message ?? error),
    };
  }
}

async function runGitViaChildProcess(args) {
  const { stdout } = await promisify(execFile)("git", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function runCli({
  env = process.env,
  runRailway = runRailwayViaChildProcess,
  runGit = runGitViaChildProcess,
  fetchImpl = fetch,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const {
    RAILWAY_SERVICE,
    RAILWAY_ENVIRONMENT,
    PRODUCTION_DOMAIN,
    RELEASE_TAG_PREFIX,
    GITHUB_OUTPUT,
  } = env;
  if (
    !RAILWAY_SERVICE ||
    !RAILWAY_ENVIRONMENT ||
    !PRODUCTION_DOMAIN ||
    !RELEASE_TAG_PREFIX ||
    !GITHUB_OUTPUT
  ) {
    logError(
      `${LOG_PREFIX}: RAILWAY_SERVICE, RAILWAY_ENVIRONMENT, PRODUCTION_DOMAIN, RELEASE_TAG_PREFIX and GITHUB_OUTPUT are required`,
    );
    return 1;
  }

  try {
    const deploymentList = parseDeploymentListOutput(
      await runRailway([
        "deployment",
        "list",
        "--service",
        RAILWAY_SERVICE,
        "--environment",
        RAILWAY_ENVIRONMENT,
        "--json",
        "--limit",
        "1",
      ]),
    );
    let health;
    let tagsAtVersion = [];
    if (deploymentList.error === null && deploymentList.deployments.length > 0) {
      health = await fetchHealth(buildHealthUrl(PRODUCTION_DOMAIN), {
        fetchImpl,
        requestTimeoutMs: MAX_REQUEST_TIMEOUT_MS,
        log,
      });
      const version = reportedVersion(health);
      if (version !== null) {
        tagsAtVersion = (await runGit(["tag", "--points-at", version])).split("\n");
      }
    }

    const decision = decideBaseline({
      deploymentList,
      health,
      tagsAtVersion,
      prefix: RELEASE_TAG_PREFIX,
    });
    if (decision.refused) {
      logError(`${LOG_PREFIX}: ${decision.reason}`);
      return 1;
    }
    log(`${LOG_PREFIX}: ${decision.reason}`);
    await appendOutput(GITHUB_OUTPUT, `previous_tag=${decision.tag ?? ""}\n`);
    return 0;
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  }
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
