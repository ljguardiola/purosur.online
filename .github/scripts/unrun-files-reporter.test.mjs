import assert from "node:assert/strict";
import { test } from "node:test";
import { UnrunFilesReporter } from "./unrun-files-reporter.mjs";

const ROOT = "/repo";

function testModule(project, file, state) {
  return { moduleId: `${ROOT}/${file}`, project: { name: project }, state: () => state };
}

function reporterWithOutput() {
  const lines = [];
  const failures = [];
  const reporter = new UnrunFilesReporter({
    log: (line) => lines.push(line),
    fail: () => failures.push("failed"),
  });
  reporter.onInit({ config: { root: ROOT } });
  return { reporter, lines, failures };
}

test("lists each test file that never ran, by project and path from the root, and fails the run", () => {
  const { reporter, lines, failures } = reporterWithOutput();

  reporter.onTestRunEnd(
    [
      testModule("node", "packages/domain/src/pricing.test.ts", "passed"),
      testModule("browser", "packages/ui/src/button.test.tsx", "pending"),
      testModule("browser", "apps/backoffice/src/products-page.test.tsx", "queued"),
    ],
    [new Error('Failed to connect to the browser session "s" [browser] within the timeout.')],
    "failed",
  );

  assert.deepEqual(lines, [
    "Test files that never ran (2)",
    "  browser  packages/ui/src/button.test.tsx",
    "  browser  apps/backoffice/src/products-page.test.tsx",
  ]);
  assert.deepEqual(failures, ["failed"]);
});

test("fails a run that ends as passed while a test file never ran", () => {
  const { reporter, failures } = reporterWithOutput();

  reporter.onTestRunEnd(
    [testModule("browser", "packages/ui/src/button.test.tsx", "pending")],
    [],
    "passed",
  );

  assert.deepEqual(failures, ["failed"]);
});

test("says nothing and fails nothing when every test file ran, whatever its result", () => {
  const { reporter, lines, failures } = reporterWithOutput();

  reporter.onTestRunEnd(
    [
      testModule("node", "a.test.ts", "passed"),
      testModule("node", "b.test.ts", "failed"),
      testModule("browser", "c.test.tsx", "skipped"),
    ],
    [],
    "failed",
  );

  assert.deepEqual(lines, []);
  assert.deepEqual(failures, []);
});

test("says nothing about the files a run the user interrupted never reached", () => {
  const { reporter, lines, failures } = reporterWithOutput();

  reporter.onTestRunEnd(
    [testModule("browser", "packages/ui/src/button.test.tsx", "pending")],
    [],
    "interrupted",
  );

  assert.deepEqual(lines, []);
  assert.deepEqual(failures, []);
});

test("by default fails the run through the process exit code", () => {
  const previousExitCode = process.exitCode;
  const reporter = new UnrunFilesReporter({ log: () => {} });
  reporter.onInit({ config: { root: ROOT } });
  try {
    reporter.onTestRunEnd(
      [testModule("browser", "packages/ui/src/button.test.tsx", "pending")],
      [],
      "passed",
    );

    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test("the real vitest.config.ts reports the test files that never ran in every run", async () => {
  const { default: config } = await import("../../vitest.config.ts");

  assert.ok(config.test.reporters.some((reporter) => reporter instanceof UnrunFilesReporter));
});
