// Marks a test slow only against the duration that is slow for its own project (node, railway-iac,
// cloud-integration, browser), instead of vitest's single built-in slowTestThreshold applied the
// same way to every kind of test. vitest.config.ts turns the built-in mark off (its root
// slowTestThreshold is ROOT_SLOW_TEST_THRESHOLD) and reports through a SlowTestsReporter instead.

const VITEST_CONFIG_PATH = new URL("../../vitest.config.ts", import.meta.url);

// Not Infinity: vitest's config can cross a JSON boundary (e.g. sent to a worker), where Infinity
// becomes null and the comparison it guards would stop working.
export const ROOT_SLOW_TEST_THRESHOLD = Number.MAX_SAFE_INTEGER;

/**
 * @param {Array<{ project: string, module: string, name: string, duration: number }>} results
 * @param {Record<string, number>} thresholdsByProject
 * @returns {Array<{ project: string, module: string, name: string, duration: number, threshold: number }>}
 *   the results whose duration is over their own project's threshold, slowest first. A result
 *   whose project has no known threshold is never slow.
 */
export function slowTestsForTheirKind(results, thresholdsByProject) {
  return results
    .map((r) => ({ ...r, threshold: thresholdsByProject[r.project] }))
    .filter((r) => typeof r.threshold === "number" && r.duration > r.threshold)
    .sort((a, b) => b.duration - a.duration);
}

/** A plain-text end-of-run block, or "" when nothing was slow for its kind. */
export function formatSlowTestsBlock(slowTests) {
  if (slowTests.length === 0) {
    return "";
  }

  const lines = slowTests.map(
    (t) => `  ${t.duration}ms > ${t.threshold}ms (${t.project})  ${t.module} > ${t.name}`,
  );
  return [`Slow for their kind of test (${slowTests.length})`, ...lines].join("\n");
}

/**
 * A vitest reporter (see https://vitest.dev/advanced/api/reporters) that replaces the built-in
 * slow mark with one relative to each project's own threshold, printed once at the end of the run.
 */
export class SlowTestsReporter {
  #thresholdsByProject;
  #vitest;
  #results = [];

  /** @param {Record<string, number>} thresholdsByProject */
  constructor(thresholdsByProject) {
    this.#thresholdsByProject = thresholdsByProject;
  }

  /** A read-only view, so a guard can check every project got a threshold. */
  get thresholdsByProject() {
    return { ...this.#thresholdsByProject };
  }

  onInit(vitest) {
    this.#vitest = vitest;
  }

  onTestRunStart() {
    this.#results = [];
  }

  onTestCaseResult(testCase) {
    const diagnostic = testCase.diagnostic();
    if (!diagnostic) {
      // Not finished yet, or skipped: nothing to judge as slow.
      return;
    }
    this.#results.push({
      project: testCase.project.name,
      module: testCase.module.relativeModuleId,
      name: testCase.fullName,
      duration: diagnostic.duration,
    });
  }

  onTestRunEnd() {
    // A reporting problem must never fail the run it is only describing.
    try {
      const block = formatSlowTestsBlock(
        slowTestsForTheirKind(this.#results, this.#thresholdsByProject),
      );
      if (block) {
        this.#vitest?.logger.log(`\n${block}`);
      }
    } catch (error) {
      this.#vitest?.logger.error(`slow-tests-reporter: could not report slow tests: ${error}`);
    }
  }
}

/** @returns {string[]} one violation per way vitest.config.ts no longer marks tests slow only
 * against their own kind: a root threshold the built-in mark could still fire against, no
 * SlowTestsReporter in test.reporters, a project with no positive finite threshold in it, or a
 * threshold that names a project that does not exist. */
export function findSlowTestsReporterViolations(config) {
  const violations = [];
  const test = config?.test ?? {};
  const projectNames = (test.projects ?? [])
    .map((project) => project?.test?.name)
    .filter((name) => typeof name === "string");

  if (test.slowTestThreshold !== ROOT_SLOW_TEST_THRESHOLD) {
    violations.push(
      `vitest.config.ts's root test.slowTestThreshold is ${test.slowTestThreshold}, expected ${ROOT_SLOW_TEST_THRESHOLD} so the built-in slow mark never fires`,
    );
  }

  const reporter = (test.reporters ?? []).find((r) => r instanceof SlowTestsReporter);
  if (reporter === undefined) {
    violations.push("vitest.config.ts's test.reporters does not include a SlowTestsReporter");
    return violations;
  }

  const thresholds = reporter.thresholdsByProject;
  for (const name of projectNames) {
    const threshold = thresholds[name];
    if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) {
      violations.push(
        `vitest.config.ts's SlowTestsReporter has no positive finite threshold for the "${name}" project`,
      );
    }
  }
  for (const name of Object.keys(thresholds)) {
    if (!projectNames.includes(name)) {
      violations.push(
        `vitest.config.ts's SlowTestsReporter has a threshold for "${name}", which is not a project`,
      );
    }
  }

  return violations;
}

/** @returns {Promise<string[]>} findSlowTestsReporterViolations against the real repository config. */
export async function checkRepository({ importConfig = () => import(VITEST_CONFIG_PATH) } = {}) {
  const { default: config } = await importConfig();
  return findSlowTestsReporterViolations(config);
}
