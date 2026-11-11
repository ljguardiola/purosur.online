// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what vitest.config.ts imports from it.

import type { Reporter } from "vitest/node";

export declare class RunScopedWarmupReporter implements Reporter {
  constructor(options: { whenRunIncludes: string; clientFiles: string[] });
  onTestRunStart: NonNullable<Reporter["onTestRunStart"]>;
  onBrowserInit: NonNullable<Reporter["onBrowserInit"]>;
}
