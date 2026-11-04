// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what vitest.config.ts imports from it.

import type { Reporter } from "vitest/node";

type OnInitArg = Parameters<NonNullable<Reporter["onInit"]>>[0];
type OnTestRunEndArgs = Parameters<NonNullable<Reporter["onTestRunEnd"]>>;

export declare class UnrunFilesReporter implements Reporter {
  constructor(options?: { log?: (line: string) => void; fail?: () => void });
  onInit(vitest: OnInitArg): void;
  onTestRunEnd(...args: OnTestRunEndArgs): void;
}
