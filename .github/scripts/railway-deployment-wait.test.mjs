import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPollDecision } from "./railway-deployment-wait.mjs";

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
