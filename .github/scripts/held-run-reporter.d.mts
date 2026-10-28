// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what vitest.config.ts imports from it.

import type { Reporter } from "vitest/node";

export declare class HeldRunReporter implements Reporter {
  constructor(options: {
    graceMs: number;
    stallMs: number;
    finishWith?: Reporter[];
    log?: (line: string) => void;
    exit?: (code: number) => void;
  });
}
