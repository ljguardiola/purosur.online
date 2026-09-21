// Pure decision logic behind waiting for the deployment `railway config apply` just triggered to
// reach a terminal state. `railway deployment list --json` has no documented way to ask for a
// single deployment by id (docs.railway.com/cli/deployment), so the workflow instead repeatedly
// reads the newest deployment (`--limit 1`) and this module decides what that read means: still
// the deployment from before `apply` (keep waiting for a new one to appear), a new deployment
// still in progress (keep waiting), a new deployment that finished (done), or nothing yet (an
// empty list right after `apply`, before Railway has written the new deployment record).

export const SUCCESS_STATUSES = new Set(["SUCCESS"]);
export const FAILURE_STATUSES = new Set(["FAILED", "CRASHED", "REMOVED", "REMOVING"]);

/**
 * @param {object} input
 * @param {string|null} input.previousId - the newest deployment id observed before `apply` ran,
 *   or null when the service had no deployment yet (its first-ever deploy).
 * @param {{ id: string, status: string } | null} input.current - the newest deployment as read
 *   just now, or null when the list came back empty.
 * @param {number} input.elapsedMs - time spent waiting so far.
 * @param {number} input.timeoutMs - the wait budget.
 * @returns {{ action: "wait" } | { action: "succeed", deploymentId: string } | { action: "fail", reason: string, deploymentId?: string }}
 */
export function nextPollDecision({ previousId, current, elapsedMs, timeoutMs }) {
  const timedOut = elapsedMs >= timeoutMs;

  if (!current || current.id === previousId) {
    if (timedOut) {
      return { action: "fail", reason: "no new deployment appeared before the timeout" };
    }
    return { action: "wait" };
  }

  if (SUCCESS_STATUSES.has(current.status)) {
    return { action: "succeed", deploymentId: current.id };
  }
  if (FAILURE_STATUSES.has(current.status)) {
    return {
      action: "fail",
      reason: `deployment ${current.id} reached status ${current.status}`,
      deploymentId: current.id,
    };
  }
  if (timedOut) {
    return {
      action: "fail",
      reason: `deployment ${current.id} did not reach a terminal status before the timeout (last seen: ${current.status})`,
      deploymentId: current.id,
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
  if (!service || !environment) {
    console.error("railway-deployment-wait: RAILWAY_SERVICE and RAILWAY_ENVIRONMENT are required");
    process.exit(1);
    return;
  }

  const timeoutMs = Number(process.env.RAILWAY_DEPLOYMENT_TIMEOUT_SECONDS ?? "600") * 1000;
  const pollIntervalMs =
    Number(process.env.RAILWAY_DEPLOYMENT_POLL_INTERVAL_SECONDS ?? "10") * 1000;

  async function readNewestDeployment() {
    const { stdout } = await execFileAsync("railway", [
      "deployment",
      "list",
      "--service",
      service,
      "--environment",
      environment,
      "--json",
      "--limit",
      "1",
    ]);
    const deployments = JSON.parse(stdout);
    return Array.isArray(deployments) && deployments.length > 0
      ? { id: deployments[0].id, status: deployments[0].status }
      : null;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const previous = await readNewestDeployment();
  const previousId = previous?.id ?? null;
  console.log(
    `railway-deployment-wait: waiting for a new deployment of "${service}" in "${environment}" (previous: ${previousId ?? "none"})`,
  );

  const start = Date.now();
  for (;;) {
    const current = await readNewestDeployment();
    const decision = nextPollDecision({
      previousId,
      current,
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
    if (current) {
      console.log(
        `railway-deployment-wait: deployment ${current.id} is ${current.status}, waiting`,
      );
    }
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
