// Polls GET /health on the staging domain until it reports the commit SHA just deployed, or the
// wait budget runs out. A deployment reaching SUCCESS only means the container started; this
// proves the new version is the one serving traffic.

/** Builds the `/health` URL from a domain value, with or without a scheme. */
export function buildHealthUrl(domain) {
  const host = domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${host}/health`;
}

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

export const MAX_REQUEST_TIMEOUT_MS = 10_000;

/** One request's timeout: capped, and never beyond what is left of the wait budget. */
export function requestTimeoutMs({ elapsedMs, timeoutMs }) {
  return Math.max(1, Math.min(MAX_REQUEST_TIMEOUT_MS, timeoutMs - elapsedMs));
}

/**
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, requestTimeoutMs: number, log?: (message: string) => void }} options
 * @returns {Promise<{ status: number, body: unknown } | null>} null when the request failed or
 *   timed out.
 */
export async function fetchHealth(url, { fetchImpl = fetch, requestTimeoutMs, log = console.log }) {
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const body = await response.json().catch(() => undefined);
    return { status: response.status, body };
  } catch (error) {
    log(`verify-cloud-health: request failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
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
  const url = buildHealthUrl(domain);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const start = Date.now();

  for (;;) {
    const result = await fetchHealth(url, {
      requestTimeoutMs: requestTimeoutMs({ elapsedMs: Date.now() - start, timeoutMs }),
    });
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
