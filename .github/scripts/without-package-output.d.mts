// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what the Vite and Vitest configurations import from it.

import type { Plugin } from "vite";

export declare function withoutPackageOutput(repoRoot: string): Plugin & {
  enforce: "pre";
  load(id: string): undefined;
};
