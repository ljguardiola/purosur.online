import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLOCK_SKEW_ALLOWANCE_MS,
  DEFAULT_MAX_CONSECUTIVE_CLI_FAILURES,
  DEFAULT_POLL_INTERVAL_SECONDS,
  nextPollDecision,
  parseDeploymentListOutput,
} from "./railway-deployment-wait.mjs";

const TARGET_IMAGE =
  "ghcr.io/ljguardiola/purosur-cloud@sha256:target111111111111111111111111111111111111111111111111111111";
const OTHER_IMAGE =
  "ghcr.io/ljguardiola/purosur-cloud@sha256:other2222222222222222222222222222222222222222222222222222222";

const APPLY_STARTED_AT = Date.parse("2026-09-21T15:14:00.000Z");

// Trimmed from a real `railway deployment list --service cloud --json` (newest first).
const DEPLOYMENT_LIST_FIXTURE = [
  {
    id: "b6b6f6d2-6e2a-4b8a-9c3a-2a2a2a2a2a2a",
    status: "SUCCESS",
    createdAt: "2026-09-21T15:14:16.636Z",
    meta: {
      image: TARGET_IMAGE,
      imageDigest: "sha256:target111111111111111111111111111111111111111111111111111111",
    },
  },
  {
    id: "a1a1a1a1-1a1a-1a1a-1a1a-1a1a1a1a1a1a",
    status: "SUCCESS",
    createdAt: "2026-09-20T10:02:41.120Z",
    meta: {
      image: OTHER_IMAGE,
      imageDigest: "sha256:other2222222222222222222222222222222222222222222222222222222",
    },
  },
];

function decide(overrides) {
  return nextPollDecision({
    targetImage: TARGET_IMAGE,
    appliedAfter: APPLY_STARTED_AT,
    deployments: DEPLOYMENT_LIST_FIXTURE,
    elapsedMs: 1000,
    timeoutMs: 60_000,
    ...overrides,
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// nextPollDecision -------------------------------------------------------------

test("waits when no deployment for the target image exists yet", () => {
  assert.deepEqual(decide({ deployments: [DEPLOYMENT_LIST_FIXTURE[1]] }), { action: "wait" });
});

test("waits on an empty deployment list", () => {
  assert.deepEqual(decide({ deployments: [] }), { action: "wait" });
});

test("fails once the timeout passes with no deployment for the target image", () => {
  const decision = decide({ deployments: [DEPLOYMENT_LIST_FIXTURE[1]], elapsedMs: 60_000 });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /no deployment/);
  assert.match(decision.reason, new RegExp(escapeRegExp(TARGET_IMAGE)));
});

test("succeeds as soon as the deployment matching the target image reaches SUCCESS", () => {
  assert.deepEqual(decide({}), {
    action: "succeed",
    deploymentId: DEPLOYMENT_LIST_FIXTURE[0].id,
  });
});

test("fails as soon as the matching deployment reaches a terminal failure status", () => {
  for (const status of ["FAILED", "CRASHED", "REMOVED", "REMOVING", "SKIPPED"]) {
    const decision = decide({ deployments: [{ ...DEPLOYMENT_LIST_FIXTURE[0], status }] });

    assert.equal(decision.action, "fail", `expected ${status} to fail`);
    assert.equal(decision.deploymentId, DEPLOYMENT_LIST_FIXTURE[0].id);
    assert.match(decision.reason, new RegExp(status));
  }
});

test("keeps waiting while the matching deployment is still in progress", () => {
  for (const status of ["QUEUED", "INITIALIZING", "BUILDING", "DEPLOYING", "WAITING"]) {
    const decision = decide({ deployments: [{ ...DEPLOYMENT_LIST_FIXTURE[0], status }] });

    assert.deepEqual(decision, { action: "wait" }, `expected to keep waiting on ${status}`);
  }
});

test("fails the matching deployment stuck mid-progress once the timeout passes", () => {
  const decision = decide({
    deployments: [{ ...DEPLOYMENT_LIST_FIXTURE[0], status: "BUILDING" }],
    elapsedMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.equal(decision.deploymentId, DEPLOYMENT_LIST_FIXTURE[0].id);
  assert.match(decision.reason, /BUILDING/);
});

test("ignores an entry with no meta.image rather than crashing", () => {
  const decision = decide({
    deployments: [{ id: "no-meta", status: "SUCCESS", createdAt: "2026-09-21T15:14:16.636Z" }],
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("ignores a deployment of the same image created before this apply started", () => {
  const stale = {
    ...DEPLOYMENT_LIST_FIXTURE[0],
    id: "stale-failed",
    status: "FAILED",
    createdAt: "2026-09-21T14:40:03.001Z",
  };

  assert.deepEqual(decide({ deployments: [stale] }), { action: "wait" });
});

test("matches the new deployment rather than an older one of the same image", () => {
  const fresh = { ...DEPLOYMENT_LIST_FIXTURE[0], id: "fresh", status: "SUCCESS" };
  const stale = {
    ...DEPLOYMENT_LIST_FIXTURE[0],
    id: "stale",
    status: "FAILED",
    createdAt: "2026-09-21T14:40:03.001Z",
  };

  assert.deepEqual(decide({ deployments: [stale, fresh] }), {
    action: "succeed",
    deploymentId: "fresh",
  });
});

test("accepts a deployment created slightly before the recorded apply start, within the clock-skew allowance", () => {
  const skewed = {
    ...DEPLOYMENT_LIST_FIXTURE[0],
    createdAt: new Date(APPLY_STARTED_AT - CLOCK_SKEW_ALLOWANCE_MS + 1000).toISOString(),
  };

  assert.equal(decide({ deployments: [skewed] }).action, "succeed");
});

test("ignores a matching-image deployment with no readable createdAt", () => {
  const undated = { ...DEPLOYMENT_LIST_FIXTURE[0], createdAt: undefined };

  assert.deepEqual(decide({ deployments: [undated] }), { action: "wait" });
});

// Apply created no new deployment (unchanged image) -------------------------------

const STALE_CREATED_AT = "2026-09-21T14:40:03.001Z";

function staleDeployment(status) {
  return { ...DEPLOYMENT_LIST_FIXTURE[0], id: "stale", status, createdAt: STALE_CREATED_AT };
}

test("prefers a new deployment that appears within the grace period", () => {
  const fresh = { ...DEPLOYMENT_LIST_FIXTURE[0], id: "fresh", status: "SUCCESS" };

  const decision = decide({
    deployments: [fresh, staleDeployment("FAILED")],
    elapsedMs: 30_000,
    graceMs: 90_000,
  });

  assert.deepEqual(decision, { action: "succeed", deploymentId: "fresh" });
});

test("keeps waiting for a new deployment while the grace period lasts, ignoring the old one", () => {
  const decision = decide({
    deployments: [staleDeployment("FAILED")],
    elapsedMs: 89_000,
    timeoutMs: 600_000,
    graceMs: 90_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("after the grace period, succeeds on the image's last deployment when it succeeded", () => {
  const decision = decide({
    deployments: [staleDeployment("SUCCESS"), DEPLOYMENT_LIST_FIXTURE[1]],
    elapsedMs: 90_000,
    timeoutMs: 600_000,
    graceMs: 90_000,
  });

  assert.deepEqual(decision, { action: "succeed", deploymentId: "stale", alreadyDeployed: true });
});

test("after the grace period, fails at once naming the image's last deployment when it failed", () => {
  const decision = decide({
    deployments: [staleDeployment("FAILED")],
    elapsedMs: 90_000,
    timeoutMs: 600_000,
    graceMs: 90_000,
  });

  assert.equal(decision.action, "fail");
  assert.equal(decision.deploymentId, "stale");
  assert.match(decision.reason, /stale/);
  assert.match(decision.reason, /FAILED/);
  assert.match(decision.reason, /no new deployment/);
});

test("after the grace period, keeps waiting on the image's last deployment while it is in progress", () => {
  const decision = decide({
    deployments: [staleDeployment("DEPLOYING")],
    elapsedMs: 120_000,
    timeoutMs: 600_000,
    graceMs: 90_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("fails an in-progress last deployment of the image once the overall timeout passes", () => {
  const decision = decide({
    deployments: [staleDeployment("DEPLOYING")],
    elapsedMs: 600_000,
    timeoutMs: 600_000,
    graceMs: 90_000,
  });

  assert.equal(decision.action, "fail");
  assert.equal(decision.deploymentId, "stale");
  assert.match(decision.reason, /DEPLOYING/);
});

test("after the grace period, keeps waiting when the image has no deployment at all", () => {
  const decision = decide({
    deployments: [DEPLOYMENT_LIST_FIXTURE[1]],
    elapsedMs: 120_000,
    timeoutMs: 600_000,
    graceMs: 90_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("by default tolerates about three minutes of consecutive CLI failures before failing fast", () => {
  const toleratedMs = DEFAULT_MAX_CONSECUTIVE_CLI_FAILURES * DEFAULT_POLL_INTERVAL_SECONDS * 1000;

  assert.equal(DEFAULT_POLL_INTERVAL_SECONDS, 10);
  assert.equal(DEFAULT_MAX_CONSECUTIVE_CLI_FAILURES, 18);
  assert.equal(toleratedMs, 180_000);
});

test("keeps waiting through a few consecutive CLI failures", () => {
  const decision = decide({
    deployments: [],
    consecutiveCliFailures: 2,
    maxConsecutiveCliFailures: 6,
    lastCliError: "Project has no services.",
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("fails fast with the CLI error once consecutive CLI failures reach the limit", () => {
  const decision = decide({
    deployments: [],
    elapsedMs: 5000,
    consecutiveCliFailures: 6,
    maxConsecutiveCliFailures: 6,
    lastCliError: "Unauthorized. Please login with `railway login`",
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /6 consecutive/);
  assert.match(decision.reason, /Unauthorized/);
});

test("includes the last CLI error in the timeout message", () => {
  const decision = decide({
    deployments: [],
    elapsedMs: 60_000,
    consecutiveCliFailures: 1,
    maxConsecutiveCliFailures: 6,
    lastCliError: "unexpected argument '--limit'",
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /unexpected argument '--limit'/);
});

// parseDeploymentListOutput -----------------------------------------------------

test("parseDeploymentListOutput returns the full array from a successful call", () => {
  const parsed = parseDeploymentListOutput({
    exitOk: true,
    stdout: JSON.stringify(DEPLOYMENT_LIST_FIXTURE),
  });

  assert.deepEqual(parsed, { deployments: DEPLOYMENT_LIST_FIXTURE, error: null });
});

test("parseDeploymentListOutput returns an empty array for an empty list", () => {
  assert.deepEqual(parseDeploymentListOutput({ exitOk: true, stdout: "[]" }), {
    deployments: [],
    error: null,
  });
});

test("parseDeploymentListOutput reports the CLI error when the call itself failed", () => {
  const parsed = parseDeploymentListOutput({
    exitOk: false,
    stdout: "",
    stderr: "Project has no services.\n",
  });

  assert.deepEqual(parsed, { deployments: [], error: "Project has no services." });
});

test("parseDeploymentListOutput reports an error for malformed output", () => {
  const parsed = parseDeploymentListOutput({ exitOk: true, stdout: "not json" });

  assert.deepEqual(parsed.deployments, []);
  assert.match(parsed.error, /not json/);
});

test("parseDeploymentListOutput reports an error when the output is valid JSON but not an array", () => {
  const parsed = parseDeploymentListOutput({ exitOk: true, stdout: "{}" });

  assert.deepEqual(parsed.deployments, []);
  assert.match(parsed.error, /\{\}/);
});
