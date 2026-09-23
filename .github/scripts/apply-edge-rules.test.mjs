import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRateLimitRules,
  buildRequestHeaderTransformRules,
  EDGE_ORIGIN_SECRET_HEADER,
  putRulesetPhase,
  runCli,
} from "./apply-edge-rules.mjs";

// buildRequestHeaderTransformRules -------------------------------------------------

test("builds one rewrite rule that sets the edge origin secret header on every request", () => {
  const body = buildRequestHeaderTransformRules("a-secret-value");

  assert.equal(body.rules.length, 1);
  const [rule] = body.rules;
  assert.equal(rule.action, "rewrite");
  assert.equal(rule.expression, "true");
  assert.equal(typeof rule.description, "string");
  assert.ok(rule.description.length > 0);
  assert.deepEqual(rule.action_parameters, {
    headers: {
      [EDGE_ORIGIN_SECRET_HEADER]: { operation: "set", value: "a-secret-value" },
    },
  });
});

test("uses a lowercase header name outside Cloudflare's cf-/x-cf- namespace", () => {
  assert.equal(EDGE_ORIGIN_SECRET_HEADER, EDGE_ORIGIN_SECRET_HEADER.toLowerCase());
  assert.ok(!EDGE_ORIGIN_SECRET_HEADER.startsWith("cf-"));
  assert.ok(!EDGE_ORIGIN_SECRET_HEADER.startsWith("x-cf-"));
});

// buildRateLimitRules ---------------------------------------------------------------

test("builds one block rule rate-limited by source address and colo", () => {
  const body = buildRateLimitRules();

  assert.equal(body.rules.length, 1);
  const [rule] = body.rules;
  assert.equal(rule.action, "block");
  assert.equal(rule.expression, "true");
  assert.ok(rule.description.length > 0);
  assert.deepEqual(rule.ratelimit, {
    characteristics: ["ip.src", "cf.colo.id"],
    period: 10,
    requests_per_period: 300,
    mitigation_timeout: 10,
  });
});

// putRulesetPhase ---------------------------------------------------------------------

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("PUTs the ruleset phase entrypoint with a bearer token and the given body", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ success: true, result: {} });
  };

  await putRulesetPhase({
    zoneId: "zone-123",
    token: "cf-token",
    phase: "http_ratelimit",
    body: { rules: [] },
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(
    call.url,
    "https://api.cloudflare.com/client/v4/zones/zone-123/rulesets/phases/http_ratelimit/entrypoint",
  );
  assert.equal(call.options.method, "PUT");
  assert.equal(call.options.headers.Authorization, "Bearer cf-token");
  assert.equal(call.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(call.options.body), { rules: [] });
});

test("throws without ever including the token when Cloudflare reports success: false", async () => {
  const fetchImpl = async () =>
    jsonResponse({ success: false, errors: [{ code: 1000, message: "bad rule" }] });

  await assert.rejects(
    putRulesetPhase({
      zoneId: "zone-123",
      token: "cf-token-should-never-appear",
      phase: "http_ratelimit",
      body: { rules: [] },
      fetchImpl,
    }),
    (error) => {
      assert.match(error.message, /bad rule/);
      assert.ok(!error.message.includes("cf-token-should-never-appear"));
      return true;
    },
  );
});

test("throws on a non-ok HTTP response", async () => {
  const fetchImpl = async () => jsonResponse({ errors: [{ message: "forbidden" }] }, 403);

  await assert.rejects(
    putRulesetPhase({
      zoneId: "zone-123",
      token: "cf-token",
      phase: "http_request_late_transform",
      body: { rules: [] },
      fetchImpl,
    }),
    /forbidden/,
  );
});

// runCli ------------------------------------------------------------------------------

function fakeCli({ env = {}, responses } = {}) {
  const calls = { fetch: [], logs: [], errors: [] };
  const deps = {
    env: {
      CLOUDFLARE_API_TOKEN: "cf-token",
      CLOUDFLARE_ZONE_ID: "zone-123",
      EDGE_ORIGIN_SECRET: "edge-secret",
      ...env,
    },
    fetchImpl: async (url, options) => {
      calls.fetch.push({ url, options });
      const response = responses?.[calls.fetch.length - 1] ?? { success: true, result: {} };
      return jsonResponse(response);
    },
    log: (message) => calls.logs.push(message),
    logError: (message) => calls.errors.push(message),
  };
  return { deps, calls };
}

test("runCli refuses clearly when a required env var is missing, making no request", async () => {
  const { deps, calls } = fakeCli({ env: { CLOUDFLARE_API_TOKEN: undefined } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 1);
  assert.equal(calls.fetch.length, 0);
  assert.ok(calls.errors.some((message) => message.includes("CLOUDFLARE_API_TOKEN")));
});

test("runCli PUTs the header transform rules, then the rate limit rules", async () => {
  const { deps, calls } = fakeCli();

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.equal(calls.fetch.length, 2);
  assert.match(calls.fetch[0].url, /http_request_late_transform/);
  assert.match(calls.fetch[1].url, /http_ratelimit/);
});

test("runCli exits non-zero and reports Cloudflare's errors when a PUT fails", async () => {
  const { deps, calls } = fakeCli({
    responses: [{ success: false, errors: [{ message: "invalid expression" }] }],
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 1);
  assert.ok(calls.errors.some((message) => message.includes("invalid expression")));
});
