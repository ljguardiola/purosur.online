import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { withoutPackageOutput } from "./without-package-output.mjs";

const REPO_ROOT = "/repo";

const load = (id) => withoutPackageOutput(REPO_ROOT).load(id);

test("fails on a module read from a workspace package's compiled output", () => {
  assert.throws(() => load(join(REPO_ROOT, "packages/domain/dist/index.js")), {
    message: /packages\/domain\/dist\/index\.js .*clean checkout/,
  });
});

test("fails on a module below a workspace package's compiled output root", () => {
  assert.throws(() => load(join(REPO_ROOT, "packages/contracts/dist/catalog/index.js")), {
    message: /packages\/contracts\/dist\/catalog\/index\.js/,
  });
});

test("fails on a compiled output module Vite reads with a query", () => {
  assert.throws(() => load(join(REPO_ROOT, "packages/domain/dist/index.js?commonjs-proxy")), {
    message: /packages\/domain\/dist\/index\.js/,
  });
});

test("loads a workspace package's source as usual", () => {
  assert.equal(load(join(REPO_ROOT, "packages/domain/src/index.ts")), undefined);
});

test("loads a dependency's own dist folder as usual", () => {
  assert.equal(
    load(join(REPO_ROOT, "node_modules/.pnpm/zod@4.6.5/node_modules/zod/dist/index.js")),
    undefined,
  );
});

test("loads a module outside the repository as usual", () => {
  assert.equal(load("/elsewhere/packages/domain/dist/index.js"), undefined);
});

test("runs before any other plugin can load the module", () => {
  assert.equal(withoutPackageOutput(REPO_ROOT).enforce, "pre");
});
