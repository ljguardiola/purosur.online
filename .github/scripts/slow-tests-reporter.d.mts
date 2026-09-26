// Type declarations for slow-tests-reporter.mjs, read only by vitest.config.ts. `.github/scripts`
// is a plain-JS directory outside tsconfig.json's `include` (see script-entry-paths.test.mjs and
// its siblings, which use JSDoc but are never themselves type-checked); this file exists solely so
// tsc can type the one thing vitest.config.ts imports from it, without turning on allowJs for the
// whole directory.

import type { Reporter } from "vitest/node";

type OnInitArg = Parameters<NonNullable<Reporter["onInit"]>>[0];
type OnTestRunStartArgs = Parameters<NonNullable<Reporter["onTestRunStart"]>>;
type OnTestCaseResultArg = Parameters<NonNullable<Reporter["onTestCaseResult"]>>[0];
type OnTestRunEndArgs = Parameters<NonNullable<Reporter["onTestRunEnd"]>>;

export declare const ROOT_SLOW_TEST_THRESHOLD: number;

export declare class SlowTestsReporter implements Reporter {
  constructor(thresholdsByProject: Record<string, number>);
  readonly thresholdsByProject: Readonly<Record<string, number>>;
  onInit(vitest: OnInitArg): void;
  onTestRunStart(...args: OnTestRunStartArgs): void;
  onTestCaseResult(testCase: OnTestCaseResultArg): void;
  onTestRunEnd(...args: OnTestRunEndArgs): void;
}
