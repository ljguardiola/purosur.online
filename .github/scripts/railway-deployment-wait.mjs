// Pure decision logic behind waiting for the deployment `railway config apply` just triggered to
// reach a terminal state. `railway deployment list --json` returns every deployment (newest
// first) with `meta.image`, the exact image reference that deployment applied (confirmed live
// against a real sandbox run: `meta.image` and `meta.imageDigest`), so the wait below finds the
// entry whose image matches the one this pipeline run just built and pushed, and tracks that
// entry's status to a terminal state. Matching by image content, rather than diffing against a
// "previous newest deployment id" snapshot taken before `apply`, needs nothing captured before
// `config apply` runs: there is no id-reuse race to avoid in the first place.

export const SUCCESS_STATUSES = new Set(["SUCCESS"]);
export const FAILURE_STATUSES = new Set(["FAILED", "CRASHED", "REMOVED", "REMOVING"]);

/**
 * Reads the deployment list out of a `railway deployment list --json` call. A failed call or
 * unparseable output reads the same as an empty list - "nothing to match yet" - rather than
 * throwing, because on the first-ever deploy the service can briefly have zero deployment records
 * right after `config apply` creates it, and the CLI is not guaranteed to return an empty JSON
 * array for that state (confirmed live: a sibling command, `domain list`, exits 1 with plain text
 * rather than `[]` when the service has nothing yet).
 *
 * @param {{ exitOk: boolean, stdout: string, stderr?: string }} raw
 * @returns {Array<{ id: string, status: string, meta?: { image?: string } }>}
 */
export function parseDeploymentListOutput(raw) {
  if (!raw.exitOk) {
    return [];
  }
  try {
    const deployments = JSON.parse(raw.stdout);
    return Array.isArray(deployments) ? deployments : [];
  } catch {
    return [];
  }
}

/**
 * @param {object} input
 * @param {string} input.targetImage - the exact image reference this pipeline run just deployed.
 * @param {Array<{ id: string, status: string, meta?: { image?: string } }>} input.deployments
 * @param {number} input.elapsedMs - time spent waiting so far.
 * @param {number} input.timeoutMs - the wait budget.
 * @returns {{ action: "wait" } | { action: "succeed", deploymentId: string } | { action: "fail", reason: string, deploymentId?: string }}
 */
export function nextPollDecision({ targetImage, deployments, elapsedMs, timeoutMs }) {
  const timedOut = elapsedMs >= timeoutMs;
  const match = (deployments ?? []).find((deployment) => deployment?.meta?.image === targetImage);

  if (!match) {
    if (timedOut) {
      return {
        action: "fail",
        reason: `no deployment for image ${targetImage} appeared before the timeout`,
      };
    }
    return { action: "wait" };
  }

  if (SUCCESS_STATUSES.has(match.status)) {
    return { action: "succeed", deploymentId: match.id };
  }
  if (FAILURE_STATUSES.has(match.status)) {
    return {
      action: "fail",
      reason: `deployment ${match.id} (image ${targetImage}) reached status ${match.status}`,
      deploymentId: match.id,
    };
  }
  if (timedOut) {
    return {
      action: "fail",
      reason: `deployment ${match.id} (image ${targetImage}) did not reach a terminal status before the timeout (last seen: ${match.status})`,
      deploymentId: match.id,
    };
  }
  return { action: "wait" };
}

async function runCli() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const service = process.env.RAILWAY_SERVICE;
  const environment = process.env.RAILWAY_ENVIRONMENT;
  const targetImage = process.env.CLOUD_IMAGE_REF;
  if (!service || !environment || !targetImage) {
    console.error(
      "railway-deployment-wait: RAILWAY_SERVICE, RAILWAY_ENVIRONMENT and CLOUD_IMAGE_REF are required",
    );
    process.exit(1);
    return;
  }

  const timeoutMs = Number(process.env.RAILWAY_DEPLOYMENT_TIMEOUT_SECONDS ?? "600") * 1000;
  const pollIntervalMs =
    Number(process.env.RAILWAY_DEPLOYMENT_POLL_INTERVAL_SECONDS ?? "10") * 1000;

  async function readDeployments() {
    let raw;
    try {
      const { stdout } = await execFileAsync("railway", [
        "deployment",
        "list",
        "--service",
        service,
        "--environment",
        environment,
        "--json",
        "--limit",
        "10",
      ]);
      raw = { exitOk: true, stdout };
    } catch (error) {
      raw = {
        exitOk: false,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? String(error.message ?? error),
      };
    }
    return parseDeploymentListOutput(raw);
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  console.log(
    `railway-deployment-wait: waiting for a deployment of "${service}" in "${environment}" for image ${targetImage}`,
  );

  const start = Date.now();
  for (;;) {
    const deployments = await readDeployments();
    const decision = nextPollDecision({
      targetImage,
      deployments,
      elapsedMs: Date.now() - start,
      timeoutMs,
    });

    if (decision.action === "succeed") {
      console.log(`railway-deployment-wait: deployment ${decision.deploymentId} succeeded`);
      return;
    }
    if (decision.action === "fail") {
      console.error(`railway-deployment-wait: ${decision.reason}`);
      process.exit(1);
      return;
    }
    console.log("railway-deployment-wait: no terminal match yet, waiting");
    await sleep(pollIntervalMs);
  }
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === new URL(import.meta.url).pathname;
if (isMainModule) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
