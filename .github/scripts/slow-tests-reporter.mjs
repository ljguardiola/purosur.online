const VITEST_CONFIG_PATH = new URL("../../vitest.config.ts", import.meta.url);

// Infinity is what vitest treats as off: its summary reporter passes any finite slowTestThreshold to
// setTimeout, which Node clamps to 1ms (with a TimeoutOverflowWarning) above 2^31 - 1.
export const ROOT_SLOW_TEST_THRESHOLD = Infinity;

export function slowTestsForTheirKind(results, thresholdsByProject) {
  return results
    .map((r) => ({ ...r, threshold: thresholdsByProject[r.project] }))
    .filter((r) => typeof r.threshold === "number" && r.duration > r.threshold)
    .sort((a, b) => b.duration - a.duration);
}

export function formatSlowTestsBlock(slowTests) {
  if (slowTests.length === 0) {
    return "";
  }

  const lines = slowTests.map(
    (t) =>
      `  ${Math.round(t.duration)}ms > ${t.threshold}ms (${t.project})  ${t.module} > ${t.name}`,
  );
  return [`Slow for their kind of test (${slowTests.length})`, ...lines].join("\n");
}

export class SlowTestsReporter {
  #thresholdsByProject;
  #vitest;
  #results = [];

  constructor(thresholdsByProject) {
    this.#thresholdsByProject = thresholdsByProject;
  }

  // A vitest browser-mode project runs as "<project> (<browser>)" unless given its own name.
  onInit(vitest) {
    this.#vitest = vitest;
    const projectNames = vitest.projects.map((project) => project.name);
    const problems = [];
    for (const name of projectNames) {
      const threshold = this.#thresholdsByProject[name];
      if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) {
        problems.push(`the "${name}" project has no positive finite threshold`);
      }
    }
    // A --project filter leaves the other projects out of vitest.projects.
    if (vitest.config.project.length === 0) {
      for (const name of Object.keys(this.#thresholdsByProject)) {
        if (!projectNames.includes(name)) {
          problems.push(`the threshold for "${name}" names no project`);
        }
      }
    }
    if (problems.length > 0) {
      throw new Error(`SlowTestsReporter in vitest.config.ts: ${problems.join("; ")}`);
    }
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
    const block = formatSlowTestsBlock(
      slowTestsForTheirKind(this.#results, this.#thresholdsByProject),
    );
    if (block) {
      this.#vitest.logger.log(`\n${block}`);
    }
  }
}

export function findSlowTestsReporterViolations(config) {
  const violations = [];
  const test = config?.test ?? {};

  if (test.slowTestThreshold !== ROOT_SLOW_TEST_THRESHOLD) {
    violations.push(
      `vitest.config.ts's root test.slowTestThreshold is ${test.slowTestThreshold}, expected ${ROOT_SLOW_TEST_THRESHOLD} so the built-in slow mark never fires`,
    );
  }

  if (!(test.reporters ?? []).some((r) => r instanceof SlowTestsReporter)) {
    violations.push("vitest.config.ts's test.reporters does not include a SlowTestsReporter");
  }

  return violations;
}

export async function checkRepository({ importConfig = () => import(VITEST_CONFIG_PATH) } = {}) {
  const { default: config } = await importConfig();
  return findSlowTestsReporterViolations(config);
}
