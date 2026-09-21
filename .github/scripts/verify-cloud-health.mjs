// Pure decision logic behind confirming a deploy actually rolled out: poll GET /health on the
// staging domain until it reports the commit SHA just deployed, or the wait budget runs out. A
// deployment reaching SUCCESS only means the container started; the health check proves the
// specific version is the one now serving traffic (the issue's own acceptance criterion).

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeFailure({ result, expectedVersion }) {
  if (!result) {
    return "the health request failed (network error, or no response was received)";
  }
  if (result.status !== 200) {
    return `GET /health returned status ${result.status}`;
  }
  if (!isPlainObject(result.body) || result.body.status !== "ok") {
    return `GET /health body was not { status: "ok", ... }: ${JSON.stringify(result.body)}`;
  }
  return `GET /health reported version ${JSON.stringify(result.body.version)}, expected ${JSON.stringify(expectedVersion)}`;
}

/**
 * @param {object} input
 * @param {{ status: number, body: unknown } | null} input.result - the last health response, or
 *   null when the request itself failed.
 * @param {string} input.expectedVersion - the commit SHA this pipeline just deployed.
 * @param {number} input.elapsedMs
 * @param {number} input.timeoutMs
 * @returns {{ action: "wait" } | { action: "succeed" } | { action: "fail", reason: string }}
 */
export function nextHealthPollDecision({ result, expectedVersion, elapsedMs, timeoutMs }) {
  const matched =
    result?.status === 200 &&
    isPlainObject(result.body) &&
    result.body.status === "ok" &&
    result.body.version === expectedVersion;

  if (matched) {
    return { action: "succeed" };
  }
  if (elapsedMs >= timeoutMs) {
    return { action: "fail", reason: describeFailure({ result, expectedVersion }) };
  }
  return { action: "wait" };
}

async function runCli() {
  const domain = process.env.CLOUD_HEALTH_DOMAIN;
  const expectedVersion = process.env.CLOUD_HEALTH_EXPECTED_VERSION;
  if (!domain || !expectedVersion) {
    console.error(
      "verify-cloud-health: CLOUD_HEALTH_DOMAIN and CLOUD_HEALTH_EXPECTED_VERSION are required",
    );
    process.exit(1);
    return;
  }

  const timeoutMs = Number(process.env.CLOUD_HEALTH_TIMEOUT_SECONDS ?? "120") * 1000;
  const pollIntervalMs = Number(process.env.CLOUD_HEALTH_POLL_INTERVAL_SECONDS ?? "5") * 1000;
  const url = `https://${domain}/health`;

  async function fetchHealth() {
    try {
      const response = await fetch(url, { redirect: "follow" });
      const body = await response.json().catch(() => undefined);
      return { status: response.status, body };
    } catch (error) {
      console.log(
        `verify-cloud-health: request failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const start = Date.now();

  for (;;) {
    const result = await fetchHealth();
    const decision = nextHealthPollDecision({
      result,
      expectedVersion,
      elapsedMs: Date.now() - start,
      timeoutMs,
    });

    if (decision.action === "succeed") {
      console.log(`verify-cloud-health: ${url} reports version ${expectedVersion}`);
      return;
    }
    if (decision.action === "fail") {
      console.error(`verify-cloud-health: ${decision.reason}`);
      process.exit(1);
      return;
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
