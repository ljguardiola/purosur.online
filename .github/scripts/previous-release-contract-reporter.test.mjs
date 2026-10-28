import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import PreviousReleaseContractReporter, {
  collectResults,
} from "./previous-release-contract-reporter.mjs";

function testCase(fullName, state) {
  return { fullName, result: () => ({ state }) };
}

function suite(fullName, errors = []) {
  return { fullName, errors: () => errors };
}

function testModule(relativeModuleId, { tests = [], suites = [], errors = [] } = {}) {
  return {
    relativeModuleId,
    errors: () => errors,
    children: { allTests: () => tests.values(), allSuites: () => suites.values() },
  };
}

test("identifies each test by its file and its full name, with its state", () => {
  const results = collectResults(
    [
      testModule("apps/cloud/src/fiscal/credit-note-route.test.ts", {
        tests: [
          testCase("POST /fiscal/credit-notes > what it answers > refuses a second", "failed"),
          testCase("POST /fiscal/credit-notes > who may ask > refuses no session", "passed"),
        ],
      }),
      testModule("apps/cloud/src/alerts/alert-close-route.test.ts", {
        tests: [testCase("closes an open alert", "skipped")],
      }),
    ],
    [],
    "failed",
  );

  assert.deepEqual(results, {
    tests: [
      {
        id: "apps/cloud/src/fiscal/credit-note-route.test.ts > POST /fiscal/credit-notes > what it answers > refuses a second",
        state: "failed",
      },
      {
        id: "apps/cloud/src/fiscal/credit-note-route.test.ts > POST /fiscal/credit-notes > who may ask > refuses no session",
        state: "passed",
      },
      {
        id: "apps/cloud/src/alerts/alert-close-route.test.ts > closes an open alert",
        state: "skipped",
      },
    ],
    otherFailures: [],
  });
});

test("records every failure outside a test: a file, a suite, an unhandled error, an interrupted run", () => {
  const results = collectResults(
    [
      testModule("apps/cloud/src/a-route.test.ts", {
        errors: [{ message: "cannot import" }],
      }),
      testModule("apps/cloud/src/b-route.test.ts", {
        suites: [suite("POST /b", [{ message: "beforeAll failed" }]), suite("POST /b > fine")],
      }),
    ],
    [{ message: "boom" }],
    "interrupted",
  );

  assert.deepEqual(results.otherFailures, [
    "apps/cloud/src/a-route.test.ts: cannot import",
    "apps/cloud/src/b-route.test.ts > POST /b: beforeAll failed",
    "unhandled error: boom",
    "the run was interrupted",
  ]);
});

test("writes the results of the run to the file it is given", () => {
  const dir = mkdtempSync(join(tmpdir(), "previous-release-contract-reporter-"));
  try {
    const resultsFile = join(dir, "results.json");
    const reporter = new PreviousReleaseContractReporter({ resultsFile });

    reporter.onTestRunEnd(
      [testModule("apps/cloud/src/a-route.test.ts", { tests: [testCase("answers", "passed")] })],
      [],
      "passed",
    );

    assert.deepEqual(JSON.parse(readFileSync(resultsFile, "utf8")), {
      tests: [{ id: "apps/cloud/src/a-route.test.ts > answers", state: "passed" }],
      otherFailures: [],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses to run without a file to write the results to", () => {
  assert.throws(() => new PreviousReleaseContractReporter({ resultsFile: "" }), /RESULTS_FILE/);
});
