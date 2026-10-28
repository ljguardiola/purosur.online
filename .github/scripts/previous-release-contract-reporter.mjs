import { writeFileSync } from "node:fs";

export function collectResults(testModules, unhandledErrors, reason) {
  const tests = [];
  const otherFailures = [];
  for (const testModule of testModules) {
    const file = testModule.relativeModuleId;
    for (const error of testModule.errors()) {
      otherFailures.push(`${file}: ${error.message}`);
    }
    for (const suite of testModule.children.allSuites()) {
      for (const error of suite.errors()) {
        otherFailures.push(`${file} > ${suite.fullName}: ${error.message}`);
      }
    }
    for (const testCase of testModule.children.allTests()) {
      tests.push({ id: `${file} > ${testCase.fullName}`, state: testCase.result().state });
    }
  }
  for (const error of unhandledErrors) {
    otherFailures.push(`unhandled error: ${error.message}`);
  }
  if (reason === "interrupted") {
    otherFailures.push("the run was interrupted");
  }
  return { tests, otherFailures };
}

export default class PreviousReleaseContractReporter {
  #resultsFile;

  constructor({ resultsFile = process.env.RESULTS_FILE } = {}) {
    if (!resultsFile) {
      throw new Error("PreviousReleaseContractReporter: RESULTS_FILE is required");
    }
    this.#resultsFile = resultsFile;
  }

  onTestRunEnd(testModules, unhandledErrors, reason) {
    writeFileSync(
      this.#resultsFile,
      JSON.stringify(collectResults(testModules, unhandledErrors, reason)),
    );
  }
}
