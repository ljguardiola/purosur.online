// `.github/scripts` is outside tsconfig.json's `include` and is never type-checked; this file
// exists only so tsc can type what the Vite and Vitest configurations import from it.

export declare function withoutPackageOutput(repoRoot: string): {
  name: string;
  enforce: "pre";
  load(id: string): undefined;
};
