// Cloudflare's ruleset-phase PUT replaces the phase's entire rule list; anything added by hand
// outside this script is lost on the next run.

import customDomains from "../../.railway/custom-domains.json" with { type: "json" };

const LOG_PREFIX = "apply-edge-rules";

const HTTP_REQUEST_LATE_TRANSFORM_PHASE = "http_request_late_transform";
const HTTP_RATELIMIT_PHASE = "http_ratelimit";

// Must match the header name the cloud's edge origin guard checks.
export const EDGE_ORIGIN_SECRET_HEADER = "x-edge-origin-secret";

const RATE_LIMIT_PERIOD_SECONDS = 10;
const RATE_LIMIT_REQUESTS_PER_PERIOD = 300;
const RATE_LIMIT_MITIGATION_TIMEOUT_SECONDS = 10;

// Lowercase dot-separated DNS labels with at least two labels: nothing that could close the
// expression's quoted string or set.
const HOSTNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function hostInExpression(hostnames) {
  if (hostnames.length === 0) {
    throw new Error(`${LOG_PREFIX}: at least one cloud hostname is required`);
  }
  for (const hostname of hostnames) {
    if (!HOSTNAME_PATTERN.test(hostname)) {
      throw new Error(`${LOG_PREFIX}: invalid cloud hostname ${JSON.stringify(hostname)}`);
    }
  }
  if (hostnames.length === 1) {
    return `http.host eq "${hostnames[0]}"`;
  }
  return `http.host in {${hostnames.map((hostname) => `"${hostname}"`).join(" ")}}`;
}

function headerTransformRule(edgeOriginSecret, hostnames, environment) {
  return {
    action: "rewrite",
    expression: hostInExpression(hostnames),
    description: `Set the ${environment} edge origin secret header the cloud app requires on every request forwarded to its origin.`,
    action_parameters: {
      headers: {
        [EDGE_ORIGIN_SECRET_HEADER]: { operation: "set", value: edgeOriginSecret },
      },
    },
  };
}

function edgeOriginSecretVariable(environment) {
  return `EDGE_ORIGIN_SECRET_${environment.toUpperCase()}`;
}

export function buildEnvironmentHeaderTransformRules(domainsByEnvironment, env) {
  const environments = Object.keys(domainsByEnvironment);
  const secrets = new Map();
  for (const environment of environments) {
    const variable = edgeOriginSecretVariable(environment);
    if (!env[variable]) {
      throw new Error(`${LOG_PREFIX}: ${variable} is required`);
    }
    secrets.set(environment, env[variable]);
  }
  if (new Set(secrets.values()).size !== secrets.size) {
    throw new Error(
      `${LOG_PREFIX}: every environment needs its own edge origin secret, but ${environments
        .map(edgeOriginSecretVariable)
        .join(", ")} are not all different`,
    );
  }
  return {
    rules: environments.map((environment) =>
      headerTransformRule(secrets.get(environment), domainsByEnvironment[environment], environment),
    ),
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

export async function runCli({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  logError = console.error,
} = {}) {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID } = env;
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    logError(`${LOG_PREFIX}: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required`);
    return 1;
  }

  try {
    const headerTransformBody = buildEnvironmentHeaderTransformRules(customDomains, env);
    await putRulesetPhase({
      zoneId: CLOUDFLARE_ZONE_ID,
      token: CLOUDFLARE_API_TOKEN,
      phase: HTTP_REQUEST_LATE_TRANSFORM_PHASE,
      body: headerTransformBody,
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

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
