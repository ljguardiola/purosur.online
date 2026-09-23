// Declares the two Cloudflare ruleset phase entrypoints the edge relies on and PUTs them
// idempotently: this script owns both phase entrypoints entirely (each PUT replaces the whole
// phase's rules, so anything added by hand outside this script is lost on the next run).
//
// http_request_late_transform sets a secret header on every request to the cloud service's
// hostnames forwarded to the origin, which apps/cloud/src/edge-origin-guard.ts requires (its
// EDGE_ORIGIN_SECRET_HEADER must match the constant below). http_ratelimit blocks a source address
// sending more than the configured rate to any hostname on the zone.
//
// API reference: https://developers.cloudflare.com/api/resources/rulesets/subresources/phases/methods/update/
// Header operation and ratelimit field shapes:
// https://github.com/cloudflare/cloudflare-typescript/blob/main/src/resources/rulesets/rules.ts
// Rate limiting field values: https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/

import customDomains from "../../.railway/custom-domains.json" with { type: "json" };

const LOG_PREFIX = "apply-edge-rules";

const HTTP_REQUEST_LATE_TRANSFORM_PHASE = "http_request_late_transform";
const HTTP_RATELIMIT_PHASE = "http_ratelimit";

/** Must match apps/cloud/src/edge-origin-guard.ts's EDGE_ORIGIN_SECRET_HEADER. */
export const EDGE_ORIGIN_SECRET_HEADER = "x-edge-origin-secret";

/** @param {Record<string, string[]>} domainsByEnvironment */
export function cloudHostnames(domainsByEnvironment) {
  return Object.values(domainsByEnvironment).flat();
}

// Only requests to these hosts get the edge origin secret, so no other origin behind this zone
// ever receives it.
export const CLOUD_HOSTNAMES = cloudHostnames(customDomains);

const RATE_LIMIT_PERIOD_SECONDS = 10;
const RATE_LIMIT_REQUESTS_PER_PERIOD = 300;
const RATE_LIMIT_MITIGATION_TIMEOUT_SECONDS = 10;

// Lowercase dot-separated DNS labels with at least two labels: nothing that could close the
// expression's quoted string or set.
const HOSTNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** @param {string[]} hostnames */
function hostInExpression(hostnames) {
  if (hostnames.length === 0) {
    throw new Error(`${LOG_PREFIX}: at least one cloud hostname is required`);
  }
  for (const hostname of hostnames) {
    if (!HOSTNAME_PATTERN.test(hostname)) {
      throw new Error(`${LOG_PREFIX}: invalid cloud hostname ${JSON.stringify(hostname)}`);
    }
  }
  return `http.host in {${hostnames.map((hostname) => `"${hostname}"`).join(" ")}}`;
}

/**
 * @param {string} edgeOriginSecret
 * @param {string[]} hostnames
 */
export function buildRequestHeaderTransformRules(edgeOriginSecret, hostnames) {
  return {
    rules: [
      {
        action: "rewrite",
        expression: hostInExpression(hostnames),
        description:
          "Set the edge origin secret header the cloud app requires on every request forwarded to its origin.",
        action_parameters: {
          headers: {
            [EDGE_ORIGIN_SECRET_HEADER]: { operation: "set", value: edgeOriginSecret },
          },
        },
      },
    ],
  };
}

export function buildRateLimitRules() {
  return {
    rules: [
      {
        action: "block",
        expression: "true",
        description:
          "Block a source address over the normal backoffice, register sync and webhook " +
          "traffic rate for any hostname on this zone.",
        ratelimit: {
          characteristics: ["ip.src", "cf.colo.id"],
          period: RATE_LIMIT_PERIOD_SECONDS,
          requests_per_period: RATE_LIMIT_REQUESTS_PER_PERIOD,
          mitigation_timeout: RATE_LIMIT_MITIGATION_TIMEOUT_SECONDS,
        },
      },
    ],
  };
}

function rulesetPhaseEntrypointUrl(zoneId, phase) {
  return `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`;
}

/**
 * @param {object} input
 * @param {string} input.zoneId
 * @param {string} input.token
 * @param {string} input.phase
 * @param {object} input.body
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function putRulesetPhase({ zoneId, token, phase, body, fetchImpl = fetch }) {
  const response = await fetchImpl(rulesetPhaseEntrypointUrl(zoneId, phase), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => undefined);
  if (!response.ok || !result?.success) {
    const errors = result?.errors
      ? JSON.stringify(result.errors)
      : `HTTP status ${response.status}`;
    throw new Error(`${LOG_PREFIX}: updating ${phase} failed: ${errors}`);
  }
  return result;
}

/** @returns {Promise<number>} the process exit code. */
export async function runCli({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  logError = console.error,
} = {}) {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, EDGE_ORIGIN_SECRET } = env;
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID || !EDGE_ORIGIN_SECRET) {
    logError(
      `${LOG_PREFIX}: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID and EDGE_ORIGIN_SECRET are required`,
    );
    return 1;
  }

  try {
    await putRulesetPhase({
      zoneId: CLOUDFLARE_ZONE_ID,
      token: CLOUDFLARE_API_TOKEN,
      phase: HTTP_REQUEST_LATE_TRANSFORM_PHASE,
      body: buildRequestHeaderTransformRules(EDGE_ORIGIN_SECRET, CLOUD_HOSTNAMES),
      fetchImpl,
    });
    log(`${LOG_PREFIX}: applied ${HTTP_REQUEST_LATE_TRANSFORM_PHASE}`);

    await putRulesetPhase({
      zoneId: CLOUDFLARE_ZONE_ID,
      token: CLOUDFLARE_API_TOKEN,
      phase: HTTP_RATELIMIT_PHASE,
      body: buildRateLimitRules(),
      fetchImpl,
    });
    log(`${LOG_PREFIX}: applied ${HTTP_RATELIMIT_PHASE}`);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  }
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
