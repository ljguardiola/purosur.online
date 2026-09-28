import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withoutPackageOutput } from "./without-package-output";

const REPO_ROOT = "/repo";

const load = (id: string) => withoutPackageOutput(REPO_ROOT).load(id);

describe("withoutPackageOutput", () => {
  it("fails the build on a module read from a workspace package's compiled output", () => {
    expect(() => load(join(REPO_ROOT, "packages/domain/dist/index.js"))).toThrow(
      /packages\/domain\/dist\/index\.js .*clean checkout/,
    );
  });

  it("fails the build on a module below a workspace package's compiled output root", () => {
    expect(() => load(join(REPO_ROOT, "packages/contracts/dist/catalog/index.js"))).toThrow(
      /packages\/contracts\/dist\/catalog\/index\.js/,
    );
  });

  it("fails the build on a compiled output module Vite reads with a query", () => {
    expect(() => load(join(REPO_ROOT, "packages/domain/dist/index.js?commonjs-proxy"))).toThrow(
      /packages\/domain\/dist\/index\.js/,
    );
  });

  it("loads a workspace package's source as usual", () => {
    expect(load(join(REPO_ROOT, "packages/domain/src/index.ts"))).toBeUndefined();
  });

  it("loads a dependency's own dist folder as usual", () => {
    expect(
      load(join(REPO_ROOT, "node_modules/.pnpm/zod@4.6.5/node_modules/zod/dist/index.js")),
    ).toBeUndefined();
  });

  it("loads a module outside the repository as usual", () => {
    expect(load("/elsewhere/packages/domain/dist/index.js")).toBeUndefined();
  });

  it("runs before any other plugin can load the module", () => {
    expect(withoutPackageOutput(REPO_ROOT).enforce).toBe("pre");
  });
});
