// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what vitest.config.ts imports from it.

import type { Reporter, TestSequencerConstructor } from "vitest/node";

export declare class RunScopedWarmupReporter implements Reporter {
  constructor(options: { whenRunIncludes: string; clientFiles: string[] });
  trackRunFiles(sequencer: TestSequencerConstructor): TestSequencerConstructor;
  onBrowserInit: NonNullable<Reporter["onBrowserInit"]>;
}
