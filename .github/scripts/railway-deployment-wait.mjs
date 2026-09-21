// Waits for the deployment `railway config apply` just triggered to reach a terminal state.
// `railway deployment list --json` returns deployments newest first, each with `createdAt` and
// `meta.image` (the exact image reference it applied).

export const SUCCESS_STATUSES = new Set(["SUCCESS"]);
export const FAILURE_STATUSES = new Set(["FAILED", "CRASHED", "REMOVED", "REMOVING", "SKIPPED"]);

// Tolerates drift between the runner's clock, which records the apply start, and Railway's,
// which stamps `createdAt`.
export const CLOCK_SKEW_ALLOWANCE_MS = 30_000;

/**
 * Reads the deployment list out of a `railway deployment list --json` call. A failed call or
 * unusable output yields an empty list plus the error, so the caller can tolerate a transient
 * failure and still surface a persistent one.
 *
 * @param {{ exitOk: boolean, stdout: string, stderr?: string }} raw
 * @returns {{ deployments: Array<{ id: string, status: string, createdAt?: string, meta?: { image?: string } }>, error: string | null }}
 */
export function parseDeploymentListOutput(raw) {
  if (!raw.exitOk) {
    return {
      deployments: [],
      error: raw.stderr?.trim() || raw.stdout?.trim() || "railway deployment list failed",
    };
  }
  let deployments;
  try {
    deployments = JSON.parse(raw.stdout);
  } catch {
    deployments = undefined;
  }
  if (!Array.isArray(deployments)) {
    return {
      deployments: [],
      error: `railway deployment list did not return a JSON array: ${raw.stdout.trim()}`,
    };
  }
  return { deployments, error: null };
}

function createdSince(deployment, appliedAfter) {
  const createdAt = Date.parse(deployment?.createdAt);
  return Number.isFinite(createdAt) && createdAt >= appliedAfter - CLOCK_SKEW_ALLOWANCE_MS;
}

/**
 * @param {object} input
 * @param {string} input.targetImage - the exact image reference this pipeline run just deployed.
 * @param {number} input.appliedAfter - epoch ms recorded right before `railway config apply` ran.
 * @param {Array<{ id: string, status: string, createdAt?: string, meta?: { image?: string } }>} input.deployments
 * @param {number} input.elapsedMs - time spent waiting so far.
 * @param {number} input.timeoutMs - the wait budget.
 * @param {number} [input.graceMs] - how long to wait for a new deployment before falling back to
 *   the image's newest deployment, since `apply` may create none for an unchanged image.
 * @param {number} [input.consecutiveCliFailures] - failed list calls in a row, up to this poll.
 * @param {number} [input.maxConsecutiveCliFailures] - failed list calls in a row that end the wait.
 * @param {string | null} [input.lastCliError] - the most recent list call error, if any.
 * @returns {{ action: "wait" } | { action: "succeed", deploymentId: string, alreadyDeployed?: true } | { action: "fail", reason: string, deploymentId?: string }}
 */
export function nextPollDecision({
  targetImage,
  appliedAfter,
  deployments,
  elapsedMs,
  timeoutMs,
  graceMs = Number.POSITIVE_INFINITY,
  consecutiveCliFailures = 0,
  maxConsecutiveCliFailures = Number.POSITIVE_INFINITY,
  lastCliError = null,
}) {
  if (consecutiveCliFailures >= maxConsecutiveCliFailures) {
    return {
      action: "fail",
      reason: `railway deployment list failed ${consecutiveCliFailures} consecutive times: ${lastCliError}`,
    };
  }

  const timedOut = elapsedMs >= timeoutMs;
  const imageDeployments = (deployments ?? []).filter(
    (deployment) => deployment?.meta?.image === targetImage,
  );
  const match = imageDeployments.find((deployment) => createdSince(deployment, appliedAfter));

  if (!match && elapsedMs >= graceMs && imageDeployments.length > 0) {
    const [previous] = imageDeployments;
    if (SUCCESS_STATUSES.has(previous.status)) {
      return { action: "succeed", deploymentId: previous.id, alreadyDeployed: true };
    }
    if (FAILURE_STATUSES.has(previous.status)) {
      return {
        action: "fail",
        reason: `apply created no new deployment for image ${targetImage}, and its last deployment ${previous.id} reached status ${previous.status}; push a new commit or redeploy`,
        deploymentId: previous.id,
      };
    }
    return pendingDecision(previous, targetImage, timedOut);
  }

  if (!match) {
    if (timedOut) {
      const cliErrorSuffix = lastCliError
        ? ` (last railway deployment list error: ${lastCliError})`
        : "";
      return {
        action: "fail",
        reason: `no deployment for image ${targetImage} appeared before the timeout${cliErrorSuffix}`,
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
  return pendingDecision(match, targetImage, timedOut);
}

function pendingDecision(deployment, targetImage, timedOut) {
  if (timedOut) {
    return {
      action: "fail",
      reason: `deployment ${deployment.id} (image ${targetImage}) did not reach a terminal status before the timeout (last seen: ${deployment.status})`,
      deploymentId: deployment.id,
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
  const appliedAfter = Date.parse(process.env.RAILWAY_APPLY_STARTED_AT ?? "");
  if (!service || !environment || !targetImage || !Number.isFinite(appliedAfter)) {
    console.error(
      "railway-deployment-wait: RAILWAY_SERVICE, RAILWAY_ENVIRONMENT, CLOUD_IMAGE_REF and an ISO 8601 RAILWAY_APPLY_STARTED_AT are required",
    );
    process.exit(1);
    return;
  }

  const timeoutMs = Number(process.env.RAILWAY_DEPLOYMENT_TIMEOUT_SECONDS ?? "600") * 1000;
  const pollIntervalMs =
    Number(process.env.RAILWAY_DEPLOYMENT_POLL_INTERVAL_SECONDS ?? "10") * 1000;
  const maxConsecutiveCliFailures = Number(process.env.RAILWAY_DEPLOYMENT_MAX_CLI_FAILURES ?? "6");
  const graceMs = Number(process.env.RAILWAY_DEPLOYMENT_GRACE_SECONDS ?? "90") * 1000;

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
  let consecutiveCliFailures = 0;
  let lastCliError = null;
  for (;;) {
    const { deployments, error } = await readDeployments();
    if (error) {
      consecutiveCliFailures += 1;
      lastCliError = error;
      console.log(
        `railway-deployment-wait: railway deployment list failed (${consecutiveCliFailures}/${maxConsecutiveCliFailures} in a row): ${error}`,
      );
    } else {
      consecutiveCliFailures = 0;
    }

    const decision = nextPollDecision({
      targetImage,
      appliedAfter,
      deployments,
      elapsedMs: Date.now() - start,
      timeoutMs,
      graceMs,
      consecutiveCliFailures,
      maxConsecutiveCliFailures,
      lastCliError,
    });

    if (decision.action === "succeed") {
      if (decision.alreadyDeployed) {
        console.log(
          `railway-deployment-wait: image ${targetImage} was already deployed by deployment ${decision.deploymentId}; apply created no new deployment`,
        );
        return;
      }
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
