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

test("prints each duration in whole milliseconds", () => {
  const block = formatSlowTestsBlock(
    slowTestsForTheirKind([result({ duration: 9504.740710999999 })], { node: 1000 }),
  );

  assert.match(block, /9505ms > 1000ms/);
  assert.doesNotMatch(block, /9504\.7/);
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

function fakeVitest({ projectNames = ["node"], projectFilter = [] } = {}) {
  const logs = [];
  return {
    vitest: {
      projects: projectNames.map((name) => ({ name })),
      config: { project: projectFilter },
      logger: { log: (message) => logs.push(message) },
    },
    logs,
  };
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

test("accepts a run whose projects each have a threshold and nothing more", () => {
  const { vitest } = fakeVitest({ projectNames: ["node", "browser"] });
  const reporter = new SlowTestsReporter({ node: 1000, browser: 2000 });

  assert.doesNotThrow(() => reporter.onInit(vitest));
});

// vitest names a browser instance "<project> (<browser>)" unless it is given a name, and hides
// the project that declares it: a threshold keyed by the declared name would never apply.
test("fails the run for a project vitest runs with no threshold", () => {
  const { vitest } = fakeVitest({ projectNames: ["node", "browser (chromium)"] });
  const reporter = new SlowTestsReporter({ node: 1000, browser: 2000 });

  assert.throws(() => reporter.onInit(vitest), /"browser \(chromium\)"/);
});

test("fails the run for a threshold that names no project vitest runs", () => {
  const { vitest } = fakeVitest({ projectNames: ["node"] });
  const reporter = new SlowTestsReporter({ node: 1000, ghost: 1000 });

  assert.throws(() => reporter.onInit(vitest), /"ghost"/);
});

test("lists every project without a threshold and every threshold without a project", () => {
  const { vitest } = fakeVitest({ projectNames: ["node", "browser (chromium)", "railway-iac"] });
  const reporter = new SlowTestsReporter({ node: 1000, browser: 2000, ghost: 1000 });

  assert.throws(
    () => reporter.onInit(vitest),
    (error) =>
      /"browser \(chromium\)"/.test(error.message) &&
      /"railway-iac"/.test(error.message) &&
      /"browser"/.test(error.message) &&
      /"ghost"/.test(error.message),
  );
});

test("fails the run for a project whose threshold is not a positive finite number", () => {
  const { vitest } = fakeVitest({ projectNames: ["node"] });

  assert.throws(() => new SlowTestsReporter({ node: 0 }).onInit(vitest), /"node"/);
  assert.throws(() => new SlowTestsReporter({ node: Infinity }).onInit(vitest), /"node"/);
});

test("accepts thresholds for projects a --project filter left out of the run", () => {
  const { vitest } = fakeVitest({ projectNames: ["node"], projectFilter: ["node"] });
  const reporter = new SlowTestsReporter({ node: 1000, browser: 2000 });

  assert.doesNotThrow(() => reporter.onInit(vitest));
});

// findSlowTestsReporterViolations ----------------------------------------------------

function config({ rootThreshold = ROOT_SLOW_TEST_THRESHOLD, reporter } = {}) {
  const reporters = reporter === null ? [] : [reporter ?? new SlowTestsReporter({ node: 1000 })];
  return { test: { slowTestThreshold: rootThreshold, reporters } };
}

test("passes a config whose root threshold is off and whose reporters include SlowTestsReporter", () => {
  assert.deepEqual(findSlowTestsReporterViolations(config()), []);
});

// vitest's summary reporter passes slowTestThreshold to setTimeout unless it is not finite, and
// Node clamps a timeout over 2^31 - 1 to 1ms with a TimeoutOverflowWarning.
test("turns the built-in mark off with a value vitest treats as off", () => {
  assert.equal(Number.isFinite(ROOT_SLOW_TEST_THRESHOLD), false);
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

// checkRepository ----------------------------------------------------------------------------

test("checkRepository reads a given vitest config module", async () => {
  const violations = await checkRepository({
    importConfig: async () => ({ default: config() }),
  });

  assert.deepEqual(violations, []);
});

// The guard itself: the real vitest.config.ts in this repository. This is what fails
// `pnpm verify` (via `node --test .github/scripts/*.test.mjs`, part of verify:static) if a future
// edit drops the reporter or lets the built-in slow mark fire again. A project/threshold mismatch
// is checked by the reporter itself, against the projects vitest actually runs.
test("the real vitest.config.ts marks tests slow only against the reporter", async () => {
  const violations = await checkRepository();

  assert.deepEqual(violations, []);
});
