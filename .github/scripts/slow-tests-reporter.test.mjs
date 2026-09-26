import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkRepository,
  findSlowTestsReporterViolations,
  formatSlowTestsBlock,
  ROOT_SLOW_TEST_THRESHOLD,
  SlowTestsReporter,
  slowTestsForTheirKind,
} from "./slow-tests-reporter.mjs";

function result(overrides = {}) {
  return {
    project: "node",
    module: "packages/domain/src/pricing.test.ts",
    name: "rounds half away from zero",
    duration: 1500,
    ...overrides,
  };
}

// slowTestsForTheirKind ------------------------------------------------------------

test("keeps a result whose duration is over its own project's threshold", () => {
  const slow = slowTestsForTheirKind([result({ duration: 1500 })], { node: 1000 });

  assert.equal(slow.length, 1);
  assert.equal(slow[0].threshold, 1000);
});

test("drops a result whose duration is at or under its own project's threshold", () => {
  const slow = slowTestsForTheirKind([result({ duration: 1000 }), result({ duration: 999 })], {
    node: 1000,
  });

  assert.deepEqual(slow, []);
});

test("judges each result against its own project's threshold, not another project's", () => {
  const slow = slowTestsForTheirKind([result({ project: "browser", duration: 1500 })], {
    node: 1000,
    browser: 2000,
  });

  assert.deepEqual(slow, []);
});

test("drops a result for a project with no known threshold", () => {
  const slow = slowTestsForTheirKind([result({ project: "unknown", duration: 999_999 })], {
    node: 1000,
  });

  assert.deepEqual(slow, []);
});

test("sorts the slow results, slowest first", () => {
  const slow = slowTestsForTheirKind(
    [result({ name: "a", duration: 1200 }), result({ name: "b", duration: 4000 })],
    { node: 1000 },
  );

  assert.deepEqual(
    slow.map((r) => r.name),
    ["b", "a"],
  );
});

test("returns an empty array for an empty result list", () => {
  assert.deepEqual(slowTestsForTheirKind([], { node: 1000 }), []);
});

// formatSlowTestsBlock ---------------------------------------------------------------

test("prints nothing for an empty list", () => {
  assert.equal(formatSlowTestsBlock([]), "");
});

test("prints a heading with the count and one line per test", () => {
  const block = formatSlowTestsBlock(
    slowTestsForTheirKind(
      [
        result({
          project: "node",
          module: "packages/domain/src/pricing.test.ts",
          name: "rounds",
          duration: 1500,
        }),
        result({
          project: "browser",
          module: "packages/ui/src/button.test.tsx",
          name: "renders",
          duration: 3000,
        }),
      ],
      { node: 1000, browser: 2000 },
    ),
  );

  assert.match(block, /Slow for their kind of test \(2\)/);
  assert.match(block, /1500/);
  assert.match(block, /1000/);
  assert.match(block, /node/);
  assert.match(block, /packages\/domain\/src\/pricing\.test\.ts/);
  assert.match(block, /rounds/);
  assert.match(block, /3000/);
  assert.match(block, /2000/);
  assert.match(block, /browser/);
  assert.match(block, /packages\/ui\/src\/button\.test\.tsx/);
  assert.match(block, /renders/);
});

// SlowTestsReporter -------------------------------------------------------------------

function fakeTestCase({ project, module, name, duration }) {
  return {
    project: { name: project },
    module: { relativeModuleId: module },
    fullName: name,
    diagnostic: () => (duration === undefined ? undefined : { duration }),
  };
}

function fakeVitest() {
  const logs = [];
  return { vitest: { logger: { log: (message) => logs.push(message) } }, logs };
}

test("collects a test case's duration under its project and module", () => {
  const { vitest, logs } = fakeVitest();
  const reporter = new SlowTestsReporter({ node: 1000 });

  reporter.onInit(vitest);
  reporter.onTestRunStart();
  reporter.onTestCaseResult(
    fakeTestCase({ project: "node", module: "a.test.ts", name: "slow one", duration: 1500 }),
  );
  reporter.onTestRunEnd();

  assert.equal(logs.length, 1);
  assert.match(logs[0], /slow one/);
});

test("skips a test case with no diagnostic yet, such as a skipped test", () => {
  const { vitest, logs } = fakeVitest();
  const reporter = new SlowTestsReporter({ node: 1000 });

  reporter.onInit(vitest);
  reporter.onTestRunStart();
  reporter.onTestCaseResult(
    fakeTestCase({ project: "node", module: "a.test.ts", name: "skipped", duration: undefined }),
  );
  reporter.onTestRunEnd();

  assert.deepEqual(logs, []);
});

test("logs nothing when no test case is slow for its kind", () => {
  const { vitest, logs } = fakeVitest();
  const reporter = new SlowTestsReporter({ node: 1000 });

  reporter.onInit(vitest);
  reporter.onTestRunStart();
  reporter.onTestCaseResult(
    fakeTestCase({ project: "node", module: "a.test.ts", name: "fast one", duration: 10 }),
  );
  reporter.onTestRunEnd();

  assert.deepEqual(logs, []);
});

test("resets the collected results on a watch-mode rerun", () => {
  const { vitest, logs } = fakeVitest();
  const reporter = new SlowTestsReporter({ node: 1000 });

  reporter.onInit(vitest);
  reporter.onTestRunStart();
  reporter.onTestCaseResult(
    fakeTestCase({
      project: "node",
      module: "a.test.ts",
      name: "first run's slow one",
      duration: 1500,
    }),
  );
  reporter.onTestRunEnd();

  reporter.onTestRunStart();
  reporter.onTestRunEnd();

  assert.equal(logs.length, 1);
  assert.deepEqual(logs[1], undefined);
});

test("never throws when the vitest instance has no logger to report through", () => {
  const reporter = new SlowTestsReporter({ node: 1000 });

  reporter.onInit(undefined);
  reporter.onTestRunStart();
  reporter.onTestCaseResult(
    fakeTestCase({ project: "node", module: "a.test.ts", name: "slow one", duration: 1500 }),
  );

  assert.doesNotThrow(() => reporter.onTestRunEnd());
});

// findSlowTestsReporterViolations ----------------------------------------------------

function config({
  rootThreshold = ROOT_SLOW_TEST_THRESHOLD,
  projectNames = ["node"],
  reporter,
} = {}) {
  const reporters = reporter === null ? [] : [reporter ?? new SlowTestsReporter({ node: 1000 })];
  return {
    test: {
      slowTestThreshold: rootThreshold,
      reporters,
      projects: projectNames.map((name) => ({ test: { name } })),
    },
  };
}

test("passes a config whose reporter has a positive finite threshold for every project", () => {
  const violations = findSlowTestsReporterViolations(
    config({
      projectNames: ["node", "browser"],
      reporter: new SlowTestsReporter({ node: 1000, browser: 2000 }),
    }),
  );

  assert.deepEqual(violations, []);
});

test("flags a root slowTestThreshold that could still let the built-in mark fire", () => {
  const violations = findSlowTestsReporterViolations(config({ rootThreshold: 300 }));

  assert.equal(violations.length, 1);
  assert.match(violations[0], /slowTestThreshold/);
});

test("flags a config with no SlowTestsReporter in test.reporters", () => {
  const violations = findSlowTestsReporterViolations(config({ reporter: null }));

  assert.equal(violations.length, 1);
  assert.match(violations[0], /SlowTestsReporter/);
});

test("flags a project with no threshold in the reporter", () => {
  const violations = findSlowTestsReporterViolations(
    config({ projectNames: ["node", "browser"], reporter: new SlowTestsReporter({ node: 1000 }) }),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /browser/);
});

test("flags a project whose threshold is not a positive finite number", () => {
  const violations = findSlowTestsReporterViolations(
    config({ reporter: new SlowTestsReporter({ node: 0 }) }),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /node/);
});

test("flags a threshold that names a project that does not exist", () => {
  const violations = findSlowTestsReporterViolations(
    config({ reporter: new SlowTestsReporter({ node: 1000, ghost: 1000 }) }),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /ghost/);
});

// checkRepository ----------------------------------------------------------------------------

test("checkRepository reads a given vitest config module", async () => {
  const violations = await checkRepository({
    importConfig: async () => ({ default: config() }),
  });

  assert.deepEqual(violations, []);
});

// The guard itself: the real vitest.config.ts in this repository. This is what fails
// `pnpm verify` (via `node --test .github/scripts/*.test.mjs`, part of verify:static) if a future
// edit adds a project the reporter has no threshold for, or lets the built-in slow mark fire again.
test("the real vitest.config.ts marks tests slow only against the reporter", async () => {
  const violations = await checkRepository();

  assert.deepEqual(violations, []);
});
