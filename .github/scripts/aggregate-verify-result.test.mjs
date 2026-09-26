import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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

test("passes on a pull request whose scope failed once static and tests ran and succeeded", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "failure",
    scopeDocsOnly: "",
    staticResult: "success",
    testsResult: "success",
  });

  assert.equal(decision.ok, true);
});

for (const scopeResult of ["failure", "cancelled"]) {
  test(`fails a pull request whose scope ended ${scopeResult} while static and tests were skipped`, () => {
    const decision = decideVerifyResult({
      eventName: "pull_request",
      scopeResult,
      scopeDocsOnly: "true",
      staticResult: "skipped",
      testsResult: "skipped",
    });

    assert.equal(decision.ok, false);
  });
}

test("fails a push that claims docs-only while static and tests were skipped", () => {
  const decision = decideVerifyResult({
    eventName: "push",
    scopeResult: "success",
    scopeDocsOnly: "true",
    staticResult: "skipped",
    testsResult: "skipped",
  });

  assert.equal(decision.ok, false);
});

for (const missing of [undefined, ""]) {
  test(`fails when the static result is ${JSON.stringify(missing)}`, () => {
    const decision = decideVerifyResult({
      eventName: "pull_request",
      scopeResult: "success",
      scopeDocsOnly: "false",
      staticResult: missing,
      testsResult: "success",
    });

    assert.equal(decision.ok, false);
    assert.match(decision.reason, /static/);
  });

  test(`fails when the tests result is ${JSON.stringify(missing)}`, () => {
    const decision = decideVerifyResult({
      eventName: "pull_request",
      scopeResult: "success",
      scopeDocsOnly: "false",
      staticResult: "success",
      testsResult: missing,
    });

    assert.equal(decision.ok, false);
    assert.match(decision.reason, /tests/);
  });
}

test("runCli fails when the static and tests results are not set at all", () => {
  const { deps } = fakeCli({ EVENT_NAME: "pull_request", SCOPE_RESULT: "success" });

  assert.equal(runCli(deps), 1);
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

// The script as a process -----------------------------------------------------------------

const scriptPath = fileURLToPath(new URL("./aggregate-verify-result.mjs", import.meta.url));

const failingJobEnv = {
  EVENT_NAME: "push",
  SCOPE_RESULT: "skipped",
  STATIC_RESULT: "success",
  TESTS_RESULT: "failure",
};

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "aggregate verify result "));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runScript(env, path = scriptPath) {
  return spawnSync(process.execPath, [path], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
}

test("the script exits 1 when a required job failed", () => {
  const result = runScript(failingJobEnv);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /tests: failure/);
});

test("the script exits 0 when every required job succeeded", () => {
  const result = runScript({
    EVENT_NAME: "push",
    SCOPE_RESULT: "skipped",
    STATIC_RESULT: "success",
    TESTS_RESULT: "success",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /every required job succeeded/);
});

test("the script still exits 1 when run through a linked directory", async () => {
  await withTempDir(async (dir) => {
    const linkedScriptsDir = join(dir, "scripts");
    await symlink(dirname(scriptPath), linkedScriptsDir, "junction");

    const result = runScript(failingJobEnv, join(linkedScriptsDir, "aggregate-verify-result.mjs"));

    assert.equal(result.status, 1);
  });
});

test("the script still exits 1 from a path that needs percent-encoding in a URL", async () => {
  await withTempDir(async (dir) => {
    const copiedScript = join(dir, "aggregate-verify-result.mjs");
    await copyFile(scriptPath, copiedScript);

    const result = runScript(failingJobEnv, copiedScript);

    assert.equal(result.status, 1);
  });
});
