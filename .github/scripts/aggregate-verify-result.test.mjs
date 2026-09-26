import assert from "node:assert/strict";
import { test } from "node:test";
import { decideVerifyResult, runCli } from "./aggregate-verify-result.mjs";

// decideVerifyResult ----------------------------------------------------------------------

test("passes on a push when static and tests both succeed", () => {
  const decision = decideVerifyResult({
    eventName: "push",
    scopeResult: "skipped",
    scopeDocsOnly: "",
    staticResult: "success",
    testsResult: "success",
  });

  assert.equal(decision.ok, true);
});

test("fails on a push when static fails, even though scope was never run", () => {
  const decision = decideVerifyResult({
    eventName: "push",
    scopeResult: "skipped",
    scopeDocsOnly: "",
    staticResult: "failure",
    testsResult: "success",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /static/);
});

test("fails on a push when the test shards fail", () => {
  const decision = decideVerifyResult({
    eventName: "push",
    scopeResult: "skipped",
    scopeDocsOnly: "",
    staticResult: "success",
    testsResult: "failure",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /tests/);
});

test("passes on a pull request when scope says docs-only and static/tests were skipped", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "true",
    staticResult: "skipped",
    testsResult: "skipped",
  });

  assert.equal(decision.ok, true);
});

test("passes on a pull request when scope says docs-only and static/tests still ran and succeeded", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "true",
    staticResult: "success",
    testsResult: "success",
  });

  assert.equal(decision.ok, true);
});

test("fails on a pull request when scope says docs-only but static still failed", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "true",
    staticResult: "failure",
    testsResult: "skipped",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /static/);
});

test("requires static and tests to have actually run when scope says the change is not docs-only", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    staticResult: "skipped",
    testsResult: "skipped",
  });

  assert.equal(decision.ok, false);
});

test("requires full verification when scope itself failed, even on a pull request", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "failure",
    scopeDocsOnly: "",
    staticResult: "success",
    testsResult: "success",
  });

  assert.equal(decision.ok, true);
});

test("fails a cancelled test shard even when static succeeded", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    staticResult: "success",
    testsResult: "cancelled",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /tests/);
});

// runCli ------------------------------------------------------------------------------------

function fakeCli(env) {
  const calls = { logs: [], errors: [] };
  const deps = {
    env,
    log: (message) => calls.logs.push(message),
    logError: (message) => calls.errors.push(message),
  };
  return { deps, calls };
}

test("runCli exits 0 and logs the reason when every required job succeeded", () => {
  const { deps, calls } = fakeCli({
    EVENT_NAME: "push",
    SCOPE_RESULT: "skipped",
    SCOPE_DOCS_ONLY: "",
    STATIC_RESULT: "success",
    TESTS_RESULT: "success",
  });

  const exitCode = runCli(deps);

  assert.equal(exitCode, 0);
  assert.equal(calls.errors.length, 0);
  assert.equal(calls.logs.length, 1);
});

test("runCli exits 1 and logs the reason to stderr when a required job failed", () => {
  const { deps, calls } = fakeCli({
    EVENT_NAME: "push",
    SCOPE_RESULT: "skipped",
    SCOPE_DOCS_ONLY: "",
    STATIC_RESULT: "success",
    TESTS_RESULT: "failure",
  });

  const exitCode = runCli(deps);

  assert.equal(exitCode, 1);
  assert.equal(calls.logs.length, 0);
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /tests/);
});
