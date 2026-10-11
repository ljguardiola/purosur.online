// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what vitest.config.ts imports from it.

import type { Reporter, TestSequencer } from "vitest/node";

type OnTestRunEndArgs = Parameters<NonNullable<Reporter["onTestRunEnd"]>>;

export declare class TestDurationsReporter implements Reporter {
  constructor(options: { outputFile: string | undefined });
  onTestRunEnd(...args: OnTestRunEndArgs): Promise<void>;
}

export declare function durationBalancedSequencer(
  durationsDir: string | undefined,
): new (
  ...args: ConstructorParameters<typeof import("vitest/node").BaseSequencer>
) => TestSequencer;
