import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { withoutPackageOutput } from "./register-clean-build.mjs";

const repoRoot = "/repo";

const load = (id) => withoutPackageOutput(repoRoot).load(id);

test("a module read from a workspace package's compiled output fails the build", () => {
  assert.throws(
    () => load(join(repoRoot, "packages/domain/dist/index.js")),
    /packages\/domain\/dist\/index\.js .*clean checkout/,
  );
});

test("a module read from a workspace package's compiled output below its root fails the build", () => {
  assert.throws(
    () => load(join(repoRoot, "packages/contracts/dist/catalog/index.js")),
    /packages\/contracts\/dist\/catalog\/index\.js/,
  );
});

test("a module read from a workspace package's source loads as usual", () => {
  assert.equal(load(join(repoRoot, "packages/domain/src/index.ts")), undefined);
});

test("a dependency's own dist folder loads as usual", () => {
  assert.equal(
    load(join(repoRoot, "node_modules/.pnpm/zod@4.6.5/node_modules/zod/dist/index.js")),
    undefined,
  );
});

test("a module outside the repository loads as usual", () => {
  assert.equal(load("/elsewhere/packages/domain/dist/index.js"), undefined);
});

test("a virtual module loads as usual", () => {
  assert.equal(load("\0vite/preload-helper.js"), undefined);
});

test("the check runs before any other plugin can load the module", () => {
  assert.equal(withoutPackageOutput(repoRoot).enforce, "pre");
});
