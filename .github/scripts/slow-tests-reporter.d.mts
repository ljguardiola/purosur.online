// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what vitest.config.ts imports from it.

import type { Reporter } from "vitest/node";

type OnInitArg = Parameters<NonNullable<Reporter["onInit"]>>[0];
type OnTestRunStartArgs = Parameters<NonNullable<Reporter["onTestRunStart"]>>;
type OnTestCaseResultArg = Parameters<NonNullable<Reporter["onTestCaseResult"]>>[0];
type OnTestRunEndArgs = Parameters<NonNullable<Reporter["onTestRunEnd"]>>;

export declare const ROOT_SLOW_TEST_THRESHOLD: number;

export declare class SlowTestsReporter implements Reporter {
  constructor(thresholdsByProject: Record<string, number>);
  onInit(vitest: OnInitArg): void;
  onTestRunStart(...args: OnTestRunStartArgs): void;
  onTestCaseResult(testCase: OnTestCaseResultArg): void;
  onTestRunEnd(...args: OnTestRunEndArgs): void;
}
