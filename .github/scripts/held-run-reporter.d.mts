// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what vitest.config.ts imports from it.

import type { Reporter, TestSequencerConstructor } from "vitest/node";

export declare class HeldRunReporter implements Reporter {
  constructor(options: {
    graceMs: number;
    stallMs: number;
    log?: (line: string) => void;
    exit?: (code: number) => void;
  });
  trackExecutedFiles(sequencer: TestSequencerConstructor): TestSequencerConstructor;
  onInit: NonNullable<Reporter["onInit"]>;
  onTestRunStart: NonNullable<Reporter["onTestRunStart"]>;
  onTestModuleQueued: NonNullable<Reporter["onTestModuleQueued"]>;
  onTestCaseResult: NonNullable<Reporter["onTestCaseResult"]>;
  onTestModuleEnd:NonNullable<Reporter["onTestModuleEnd"]>;
  onTestRunEnd: NonNullable<Reporter["onTestRunEnd"]>;
}
