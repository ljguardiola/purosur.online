import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decideVerifyResult, runCli } from "./aggregate-verify-result.mjs";

const PASSING = {
  scopeTestsNeeded: "true",
  scopeCatalogChanged: "true",
  visualResult: "success",
};

test("passes on a push when static, tests and visual all succeed", () => {
  const decision = decideVerifyResult({
    eventName: "push",
    scopeResult: "skipped",
    scopeDocsOnly: "",
    staticResult: "success",
    testsResult: "success",
    ...PASSING,
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
    ...PASSING,
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
    ...PASSING,
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
    ...PASSING,
    scopeTestsNeeded: "false",
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
    ...PASSING,
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
    ...PASSING,
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
    ...PASSING,
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
    ...PASSING,
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
      ...PASSING,
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
    ...PASSING,
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
      ...PASSING,
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
      ...PASSING,
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
    ...PASSING,
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /tests/);
});

test("passes on a pull request when scope says the test shards read no changed path, static ran and tests were skipped", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    staticResult: "success",
    testsResult: "skipped",
    ...PASSING,
    scopeTestsNeeded: "false",
  });

  assert.equal(decision.ok, true);
  assert.match(decision.reason, /test shards/);
});

test("requires static to have actually run when scope says only the test shards may be skipped", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    staticResult: "skipped",
    testsResult: "skipped",
    ...PASSING,
    scopeTestsNeeded: "false",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /static/);
});

test("fails on a pull request when scope says the test shards read no changed path but they still failed", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    staticResult: "success",
    testsResult: "failure",
    ...PASSING,
    scopeTestsNeeded: "false",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /tests/);
});

test("fails on a pull request when scope says docs-only but the test shards still ran and failed", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "true",
    staticResult: "skipped",
    testsResult: "failure",
    ...PASSING,
    scopeTestsNeeded: "false",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /tests/);
});

for (const scopeTestsNeeded of ["true", "", undefined]) {
  test(`requires the test shards to have actually run when scope's tests_needed is ${JSON.stringify(scopeTestsNeeded)}`, () => {
    const decision = decideVerifyResult({
      eventName: "pull_request",
      scopeResult: "success",
      scopeDocsOnly: "true",
      staticResult: "skipped",
      testsResult: "skipped",
      ...PASSING,
      scopeTestsNeeded,
    });

    assert.equal(decision.ok, false);
    assert.match(decision.reason, /tests/);
  });
}

for (const scopeResult of ["failure", "cancelled"]) {
  test(`fails a pull request whose scope ended ${scopeResult} while claiming the test shards could be skipped`, () => {
    const decision = decideVerifyResult({
      eventName: "pull_request",
      scopeResult,
      scopeDocsOnly: "false",
      staticResult: "success",
      testsResult: "skipped",
      ...PASSING,
      scopeTestsNeeded: "false",
    });

    assert.equal(decision.ok, false);
    assert.match(decision.reason, /tests/);
  });
}

test("fails a push that claims the test shards could be skipped while they were", () => {
  const decision = decideVerifyResult({
    eventName: "push",
    scopeResult: "success",
    scopeDocsOnly: "false",
    staticResult: "success",
    testsResult: "skipped",
    ...PASSING,
    scopeTestsNeeded: "false",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /tests/);
});

test("runCli reads scope's tests_needed from SCOPE_TESTS_NEEDED", () => {
  const { deps, calls } = fakeCli({
    EVENT_NAME: "pull_request",
    SCOPE_RESULT: "success",
    SCOPE_DOCS_ONLY: "false",
    SCOPE_TESTS_NEEDED: "false",
    SCOPE_CATALOG_CHANGED: "false",
    STATIC_RESULT: "success",
    TESTS_RESULT: "skipped",
    VISUAL_RESULT: "skipped",
  });

  assert.equal(runCli(deps), 0, calls.errors.join("\n"));
});

test("passes when the scope decisively says the catalog is unchanged and visual was skipped", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    scopeCatalogChanged: "false",
    staticResult: "success",
    testsResult: "success",
    visualResult: "skipped",
  });

  assert.equal(decision.ok, true);
});

test("passes when the scope decisively says the catalog is unchanged and visual still ran and succeeded", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    scopeCatalogChanged: "false",
    staticResult: "success",
    testsResult: "success",
    visualResult: "success",
  });

  assert.equal(decision.ok, true);
});

test("fails when the scope decisively says the catalog is unchanged but visual still failed", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    scopeCatalogChanged: "false",
    staticResult: "success",
    testsResult: "success",
    visualResult: "failure",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /visual/);
});

test("requires visual to have actually run when scope says the catalog changed", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    scopeCatalogChanged: "true",
    staticResult: "success",
    testsResult: "success",
    visualResult: "skipped",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /visual/);
});

test("requires visual to have actually run on a push, even though scope's docs-only column never gates a push", () => {
  const decision = decideVerifyResult({
    eventName: "push",
    scopeResult: "success",
    scopeDocsOnly: "",
    scopeCatalogChanged: "false",
    staticResult: "success",
    testsResult: "success",
    visualResult: "success",
  });

  assert.equal(decision.ok, true);
});

for (const scopeResult of ["failure", "cancelled"]) {
  test(`requires visual to have actually run when scope ended ${scopeResult}, even if it claims catalog_changed=false`, () => {
    const decision = decideVerifyResult({
      eventName: "pull_request",
      scopeResult,
      scopeDocsOnly: "true",
      scopeCatalogChanged: "false",
      staticResult: "success",
      testsResult: "success",
      visualResult: "skipped",
    });

    assert.equal(decision.ok, false);
    assert.match(decision.reason, /visual/);
  });
}

test("fails a cancelled visual job even when static and tests succeeded", () => {
  const decision = decideVerifyResult({
    eventName: "pull_request",
    scopeResult: "success",
    scopeDocsOnly: "false",
    scopeCatalogChanged: "true",
    staticResult: "success",
    testsResult: "success",
    visualResult: "cancelled",
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /visual/);
});

for (const missing of [undefined, ""]) {
  test(`fails when the visual result is ${JSON.stringify(missing)}`, () => {
    const decision = decideVerifyResult({
      eventName: "pull_request",
      scopeResult: "success",
      scopeDocsOnly: "false",
      scopeCatalogChanged: "true",
      staticResult: "success",
      testsResult: "success",
      visualResult: missing,
    });

    assert.equal(decision.ok, false);
    assert.match(decision.reason, /visual/);
  });
}

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
    SCOPE_CATALOG_CHANGED: "true",
    STATIC_RESULT: "success",
    TESTS_RESULT: "success",
    VISUAL_RESULT: "success",
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
    SCOPE_CATALOG_CHANGED: "true",
    STATIC_RESULT: "success",
    TESTS_RESULT: "failure",
    VISUAL_RESULT: "success",
  });

  const exitCode = runCli(deps);

  assert.equal(exitCode, 1);
  assert.equal(calls.logs.length, 0);
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /tests/);
});

const scriptPath = fileURLToPath(new URL("./aggregate-verify-result.mjs", import.meta.url));

const failingJobEnv = {
  EVENT_NAME: "push",
  SCOPE_RESULT: "skipped",
  SCOPE_CATALOG_CHANGED: "true",
  STATIC_RESULT: "success",
  TESTS_RESULT: "failure",
  VISUAL_RESULT: "success",
};

const passingJobEnv = { ...failingJobEnv, TESTS_RESULT: "success" };

function runScript(env) {
  return spawnSync(process.execPath, [scriptPath], {
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
  const result = runScript(passingJobEnv);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /every required job succeeded/);
});
