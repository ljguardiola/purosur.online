import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPollDecision, parseDeploymentListOutput } from "./railway-deployment-wait.mjs";

const TARGET_IMAGE =
  "ghcr.io/ljguardiola/purosur-cloud@sha256:target111111111111111111111111111111111111111111111111111111";
const OTHER_IMAGE =
  "ghcr.io/ljguardiola/purosur-cloud@sha256:other2222222222222222222222222222222222222222222222222222222";

// Trimmed from a real sandbox run's `railway deployment list --service cloud --json` (newest
// first): each item carries `meta.image`, the exact image reference that deployment applied, and
// `meta.imageDigest`. Matching on this directly - instead of diffing against a "previous newest
// deployment id" snapshot - removes the only race that mattered here: there is no longer a need to
// capture anything before `config apply` runs, because the target is identified by its content
// (the image this very pipeline run built), not by "whichever one changed since last time".
const DEPLOYMENT_LIST_FIXTURE = [
  {
    id: "b6b6f6d2-6e2a-4b8a-9c3a-2a2a2a2a2a2a",
    status: "SUCCESS",
    meta: {
      image: TARGET_IMAGE,
      imageDigest: "sha256:target111111111111111111111111111111111111111111111111111111",
    },
  },
  {
    id: "a1a1a1a1-1a1a-1a1a-1a1a-1a1a1a1a1a1a",
    status: "SUCCESS",
    meta: {
      image: OTHER_IMAGE,
      imageDigest: "sha256:other2222222222222222222222222222222222222222222222222222222",
    },
  },
];

// nextPollDecision -------------------------------------------------------------

test("waits when no deployment for the target image exists yet", () => {
  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments: [DEPLOYMENT_LIST_FIXTURE[1]],
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("waits on an empty deployment list", () => {
  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments: [],
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("fails once the timeout passes with no deployment for the target image", () => {
  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments: [DEPLOYMENT_LIST_FIXTURE[1]],
    elapsedMs: 60_000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /no deployment/);
  assert.match(decision.reason, new RegExp(TARGET_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("succeeds as soon as the deployment matching the target image reaches SUCCESS", () => {
  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments: DEPLOYMENT_LIST_FIXTURE,
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "succeed", deploymentId: DEPLOYMENT_LIST_FIXTURE[0].id });
});

test("fails as soon as the deployment matching the target image reaches FAILED", () => {
  const deployments = [
    { ...DEPLOYMENT_LIST_FIXTURE[0], status: "FAILED" },
    DEPLOYMENT_LIST_FIXTURE[1],
  ];

  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments,
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.equal(decision.deploymentId, DEPLOYMENT_LIST_FIXTURE[0].id);
  assert.match(decision.reason, /FAILED/);
});

test("fails as soon as the deployment matching the target image reaches CRASHED", () => {
  const deployments = [
    { ...DEPLOYMENT_LIST_FIXTURE[0], status: "CRASHED" },
    DEPLOYMENT_LIST_FIXTURE[1],
  ];

  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments,
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /CRASHED/);
});

test("fails as soon as the deployment matching the target image reaches REMOVED", () => {
  const deployments = [{ ...DEPLOYMENT_LIST_FIXTURE[0], status: "REMOVED" }];

  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments,
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /REMOVED/);
});

test("keeps waiting while the matching deployment is still in progress", () => {
  for (const status of ["QUEUED", "INITIALIZING", "BUILDING", "DEPLOYING", "WAITING"]) {
    const deployments = [{ ...DEPLOYMENT_LIST_FIXTURE[0], status }];

    const decision = nextPollDecision({
      targetImage: TARGET_IMAGE,
      deployments,
      elapsedMs: 1000,
      timeoutMs: 60_000,
    });

    assert.deepEqual(decision, { action: "wait" }, `expected to keep waiting on ${status}`);
  }
});

test("fails the matching deployment stuck mid-progress once the timeout passes", () => {
  const deployments = [{ ...DEPLOYMENT_LIST_FIXTURE[0], status: "BUILDING" }];

  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments,
    elapsedMs: 60_000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.equal(decision.deploymentId, DEPLOYMENT_LIST_FIXTURE[0].id);
  assert.match(decision.reason, /BUILDING/);
});

test("ignores an entry with no meta.image rather than crashing", () => {
  const decision = nextPollDecision({
    targetImage: TARGET_IMAGE,
    deployments: [{ id: "no-meta", status: "SUCCESS" }],
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

// parseDeploymentListOutput -----------------------------------------------------

test("parseDeploymentListOutput returns the full array from a successful call", () => {
  const deployments = parseDeploymentListOutput({
    exitOk: true,
    stdout: JSON.stringify(DEPLOYMENT_LIST_FIXTURE),
  });

  assert.deepEqual(deployments, DEPLOYMENT_LIST_FIXTURE);
});

test("parseDeploymentListOutput returns an empty array for an empty list", () => {
  assert.deepEqual(parseDeploymentListOutput({ exitOk: true, stdout: "[]" }), []);
});

// On the very first deploy the service may briefly have no deployment records right after
// `config apply` creates it; a real CLI failure at this point (as seen live for the sibling
// `domain list` command against a service with nothing yet: "Project has no services.") must read
// as "nothing yet", not crash the poll loop.
test("parseDeploymentListOutput returns an empty array when the CLI call itself failed", () => {
  const deployments = parseDeploymentListOutput({
    exitOk: false,
    stdout: "",
    stderr: "Project has no services.\n",
  });

  assert.deepEqual(deployments, []);
});

test("parseDeploymentListOutput returns an empty array for malformed output", () => {
  assert.deepEqual(parseDeploymentListOutput({ exitOk: true, stdout: "not json" }), []);
});

test("parseDeploymentListOutput returns an empty array when the output is valid JSON but not an array", () => {
  assert.deepEqual(parseDeploymentListOutput({ exitOk: true, stdout: "{}" }), []);
});
