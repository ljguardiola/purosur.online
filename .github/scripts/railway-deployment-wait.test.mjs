import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextPollDecision,
  parseDeploymentListOutput,
  resolvePreviousId,
} from "./railway-deployment-wait.mjs";

test("waits when the newest deployment is still the pre-apply one", () => {
  const decision = nextPollDecision({
    previousId: "dep-old",
    current: { id: "dep-old", status: "SUCCESS" },
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("fails when no new deployment appears before the timeout", () => {
  const decision = nextPollDecision({
    previousId: "dep-old",
    current: { id: "dep-old", status: "SUCCESS" },
    elapsedMs: 60_000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, {
    action: "fail",
    reason: "no new deployment appeared before the timeout",
  });
});

test("waits when the list comes back empty, even past a previous id", () => {
  const decision = nextPollDecision({
    previousId: "dep-old",
    current: null,
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("waits when there was never a previous deployment and none has appeared yet", () => {
  const decision = nextPollDecision({
    previousId: null,
    current: null,
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("succeeds as soon as a new deployment id reaches SUCCESS", () => {
  const decision = nextPollDecision({
    previousId: "dep-old",
    current: { id: "dep-new", status: "SUCCESS" },
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "succeed", deploymentId: "dep-new" });
});

test("treats any new id as the deployment to track when there was no previous one", () => {
  const decision = nextPollDecision({
    previousId: null,
    current: { id: "dep-first", status: "SUCCESS" },
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "succeed", deploymentId: "dep-first" });
});

test("fails as soon as a new deployment reaches FAILED", () => {
  const decision = nextPollDecision({
    previousId: "dep-old",
    current: { id: "dep-new", status: "FAILED" },
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, {
    action: "fail",
    reason: "deployment dep-new reached status FAILED",
    deploymentId: "dep-new",
  });
});

test("fails as soon as a new deployment reaches CRASHED", () => {
  const decision = nextPollDecision({
    previousId: "dep-old",
    current: { id: "dep-new", status: "CRASHED" },
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /CRASHED/);
});

test("keeps waiting while a new deployment is still in progress", () => {
  for (const status of ["QUEUED", "INITIALIZING", "BUILDING", "DEPLOYING", "WAITING"]) {
    const decision = nextPollDecision({
      previousId: "dep-old",
      current: { id: "dep-new", status },
      elapsedMs: 1000,
      timeoutMs: 60_000,
    });

    assert.deepEqual(decision, { action: "wait" }, `expected to keep waiting on ${status}`);
  }
});

test("fails a new deployment stuck mid-progress once the timeout passes", () => {
  const decision = nextPollDecision({
    previousId: "dep-old",
    current: { id: "dep-new", status: "BUILDING" },
    elapsedMs: 60_000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, {
    action: "fail",
    reason:
      "deployment dep-new did not reach a terminal status before the timeout (last seen: BUILDING)",
    deploymentId: "dep-new",
  });
});

// parseDeploymentListOutput ---------------------------------------------------

test("parseDeploymentListOutput reads the newest deployment from a successful call", () => {
  const current = parseDeploymentListOutput({
    exitOk: true,
    stdout: JSON.stringify([{ id: "dep-new", status: "SUCCESS" }]),
  });

  assert.deepEqual(current, { id: "dep-new", status: "SUCCESS" });
});

test("parseDeploymentListOutput returns null for an empty list", () => {
  const current = parseDeploymentListOutput({ exitOk: true, stdout: "[]" });

  assert.equal(current, null);
});

// On the very first deploy, the service exists (created earlier in the same `config apply`) but
// may still have zero deployment records for a moment; a real CLI error at this point (as seen
// live for `domain list` against a service with nothing yet: "Project has no services.") must
// read as "nothing yet", not crash the poll loop.
test("parseDeploymentListOutput treats a failed CLI call as no deployment yet, not a crash", () => {
  const current = parseDeploymentListOutput({
    exitOk: false,
    stdout: "",
    stderr: "Project has no services.\n",
  });

  assert.equal(current, null);
});

test("parseDeploymentListOutput treats malformed output as no deployment yet", () => {
  const current = parseDeploymentListOutput({ exitOk: true, stdout: "not json" });

  assert.equal(current, null);
});

// resolvePreviousId -----------------------------------------------------------

// A workflow step captures the newest deployment id strictly *before* `railway config apply`
// runs, so this script never has to guess whether its own first read (which necessarily happens
// after apply already ran) beat Railway to recording the brand-new deployment - a race that would
// otherwise make the very deployment being waited for look like "the old one".
test("resolvePreviousId uses the pre-apply-captured id when one was provided", () => {
  assert.equal(resolvePreviousId("dep-old", { id: "dep-should-be-ignored" }), "dep-old");
});

test("resolvePreviousId reads an explicitly empty pre-apply capture as no previous deployment", () => {
  assert.equal(resolvePreviousId("", { id: "dep-should-be-ignored" }), null);
});

test("resolvePreviousId falls back to a self-captured read when no override was given", () => {
  assert.equal(resolvePreviousId(undefined, { id: "dep-self" }), "dep-self");
  assert.equal(resolvePreviousId(undefined, null), null);
});
