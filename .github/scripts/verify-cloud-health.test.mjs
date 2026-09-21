import assert from "node:assert/strict";
import { test } from "node:test";
import { nextHealthPollDecision } from "./verify-cloud-health.mjs";

test("succeeds when /health reports ok and the expected version", () => {
  const decision = nextHealthPollDecision({
    result: { status: 200, body: { status: "ok", version: "abc123" } },
    expectedVersion: "abc123",
    elapsedMs: 0,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "succeed" });
});

test("waits when the request failed and the timeout has not passed", () => {
  const decision = nextHealthPollDecision({
    result: null,
    expectedVersion: "abc123",
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("fails once the timeout passes with no successful response", () => {
  const decision = nextHealthPollDecision({
    result: null,
    expectedVersion: "abc123",
    elapsedMs: 60_000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /network error|failed/i);
});

test("waits, not fails, when the version has not rolled over yet", () => {
  const decision = nextHealthPollDecision({
    result: { status: 200, body: { status: "ok", version: "old-sha" } },
    expectedVersion: "abc123",
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("fails with the observed and expected version once the timeout passes on a version mismatch", () => {
  const decision = nextHealthPollDecision({
    result: { status: 200, body: { status: "ok", version: "old-sha" } },
    expectedVersion: "abc123",
    elapsedMs: 60_000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /old-sha/);
  assert.match(decision.reason, /abc123/);
});

test("waits on a non-200 status before the timeout", () => {
  const decision = nextHealthPollDecision({
    result: { status: 503, body: undefined },
    expectedVersion: "abc123",
    elapsedMs: 1000,
    timeoutMs: 60_000,
  });

  assert.deepEqual(decision, { action: "wait" });
});

test("fails on a non-200 status once the timeout passes", () => {
  const decision = nextHealthPollDecision({
    result: { status: 503, body: undefined },
    expectedVersion: "abc123",
    elapsedMs: 60_000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /503/);
});

test("fails once the timeout passes on a malformed body", () => {
  const decision = nextHealthPollDecision({
    result: { status: 200, body: { unexpected: true } },
    expectedVersion: "abc123",
    elapsedMs: 60_000,
    timeoutMs: 60_000,
  });

  assert.equal(decision.action, "fail");
  assert.match(decision.reason, /status.*ok/i);
});
