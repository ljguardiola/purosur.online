import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  collectImportedModules,
  createImportResolver,
  describeViolation,
  findBrowserTestFiles,
  findImportSpecifiers,
  findViMockCalls,
  readBrowserTestGlobs,
} from "./no-vi-mock-in-browser-tests.mjs";

// findViMockCalls ------------------------------------------------------------------------

test("finds a vi.mock call on its own line", () => {
  const source = [
    'import { vi } from "vitest";',
    "",
    'vi.mock("./sessionApi", () => ({}));',
    "",
  ].join("\n");

  const matches = findViMockCalls(source);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].line, 3);
});

test("finds a vi.mock call with space before the parenthesis", () => {
  const matches = findViMockCalls('vi.mock ("./sessionApi", () => ({}));');

  assert.equal(matches.length, 1);
});

test("finds every vi.mock call in a file with more than one", () => {
  const source = [
    'vi.mock("./sessionApi", () => ({}));',
    'vi.mock("@simplewebauthn/browser", () => ({}));',
  ].join("\n");

  const matches = findViMockCalls(source);

  assert.equal(matches.length, 2);
  assert.deepEqual(
    matches.map((match) => match.line),
    [1, 2],
  );
});

test("finds nothing in a file that only injects services", () => {
  const source = [
    'import { render } from "vitest-browser-react";',
    'import { SignInScreen } from "./SignInScreen";',
    "",
    'test("signs in", async () => {',
    "  const services = createServices();",
    "  await render(<SignInScreen services={services} />);",
    "});",
  ].join("\n");

  assert.deepEqual(findViMockCalls(source), []);
});

test("finds a vi.doMock call", () => {
  const matches = findViMockCalls('vi.doMock("./sessionApi", () => ({}));');

  assert.equal(matches.length, 1);
});

test("finds a vi.mock call with type arguments", () => {
  const matches = findViMockCalls(
    'vi.mock<typeof import("./sessionApi")>("./sessionApi", () => ({}));',
  );

  assert.equal(matches.length, 1);
});

test("finds a vi.mock call split across lines, reported at the line where it starts", () => {
  const source = ['import { vi } from "vitest";', "vi", '  .mock("./sessionApi");'].join("\n");

  const matches = findViMockCalls(source);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].line, 2);
});

test("ignores vi.mock mentioned in a line comment", () => {
  assert.deepEqual(findViMockCalls('// never vi.mock("./sessionApi") here'), []);
});

test("ignores vi.mock mentioned in a block comment", () => {
  assert.deepEqual(findViMockCalls('/*\n * vi.mock("./sessionApi") is unreliable\n */'), []);
});

test("ignores vi.mock mentioned in a string", () => {
  assert.deepEqual(findViMockCalls(`const hint = "vi.mock('./sessionApi')";`), []);
});

test("does not flag vi.mocked", () => {
  assert.deepEqual(findViMockCalls("vi.mocked(services.signIn).mockResolvedValue(session);"), []);
});

test("does not flag a mock method on another object", () => {
  assert.deepEqual(findViMockCalls('services.mock("./sessionApi");'), []);
});

test("finds a vi.importMock call", () => {
  const matches = findViMockCalls('await vi.importMock("./sessionApi");');

  assert.equal(matches.length, 1);
});

test("finds a vi.mock call written as element access", () => {
  const matches = findViMockCalls('vi["mock"]("./sessionApi", () => ({}));');

  assert.equal(matches.length, 1);
});

test("finds a vi.mock call on vi imported from vitest under another name", () => {
  const source = ['import { vi as v } from "vitest";', 'v.mock("./sessionApi", () => ({}));'].join(
    "\n",
  );

  assert.equal(findViMockCalls(source).length, 1);
});

test("finds a vi.mock call on vi reached through a vitest namespace import", () => {
  const source = [
    'import * as vitest from "vitest";',
    'vitest.vi.mock("./sessionApi", () => ({}));',
  ].join("\n");

  assert.equal(findViMockCalls(source).length, 1);
});

test("does not flag a mock method on a name imported from another module", () => {
  const source = [
    'import { vi as v } from "./fakes";',
    'import * as fakes from "./fakes";',
    'v.mock("./sessionApi");',
    'fakes.vi.mock("./sessionApi");',
  ].join("\n");

  assert.deepEqual(findViMockCalls(source), []);
});

test("reports the text of the line a vi.mock call starts on after a Unicode line separator", () => {
  const source = 'const hint = "a b";\nvi.mock("./sessionApi", () => ({}));';

  const [match] = findViMockCalls(source);

  assert.equal(match.text, 'vi.mock("./sessionApi", () => ({}));');
});

// readBrowserTestGlobs ---------------------------------------------------------------------

test("reads the include globs of the browser project from a Vitest config", () => {
  const config = [
    "export default defineConfig({",
    "  test: {",
    "    projects: [",
    '      { test: { name: "node", include: ["src/**/*.test.ts"] } },',
    '      { plugins: [react()], test: { name: "browser", include: ["a/**/*.test.tsx", "b/*.test.tsx"] } },',
    "    ],",
    "  },",
    "});",
  ].join("\n");

  assert.deepEqual(readBrowserTestGlobs(config), ["a/**/*.test.tsx", "b/*.test.tsx"]);
});

test("reads the browser globs from a config that uses TypeScript-only generic and assertion syntax", () => {
  const config = [
    "const id = <T>(x: T) => x;",
    "const kind = <string>id(process.env.KIND);",
    'export default { test: { projects: [{ test: { name: "browser", include: ["a/**/*.test.tsx"] } }] } };',
  ].join("\n");

  assert.deepEqual(readBrowserTestGlobs(config), ["a/**/*.test.tsx"]);
});

test("fails when the Vitest config has no browser project", () => {
  assert.throws(
    () => readBrowserTestGlobs('export default { test: { name: "node" } };'),
    /^Error: Vitest config has no browser project$/,
  );
});

test("fails when the browser project has no include array", () => {
  assert.throws(
    () => readBrowserTestGlobs('export default { test: { name: "browser", include: globs } };'),
    /^Error: Vitest config's browser project has no include array$/,
  );
});

test("fails when the browser project include lists something other than a string literal", () => {
  assert.throws(
    () =>
      readBrowserTestGlobs('export default { test: { name: "browser", include: ["a", glob] } };'),
    /^Error: Vitest config's browser project include must list string literals$/,
  );
});

// checkFiles -------------------------------------------------------------------------------

test("reports the file and line of every vi.mock call across several files", () => {
  const files = {
    "a.test.tsx": 'import { vi } from "vitest";\nvi.mock("./a");\n',
    "b.test.tsx": "export const clean = true;\n",
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "a.test.tsx");
  assert.equal(violations[0].line, 2);
});

test("describes a violation with its file, line and source text", () => {
  const description = describeViolation({ path: "a.test.tsx", line: 2, text: 'vi.mock("./a");' });

  assert.equal(description, 'a.test.tsx:2: vi.mock("./a");');
});

test("parses a .ts file as TypeScript, not TSX, so a type assertion does not hide a vi.mock call after it", () => {
  const files = {
    "helper.ts": 'const kind = <string>id(process.env.KIND);\nvi.mock("./a");\n',
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.deepEqual(
    violations.map((violation) => violation.line),
    [2],
  );
});

// findImportSpecifiers ---------------------------------------------------------------------

test("finds the specifiers of static imports, re-exports and dynamic imports", () => {
  const source = [
    'import { vi } from "vitest";',
    'import { createServices } from "./test-support/productsListScreen";',
    'export { almacen } from "../fixtures";',
    'const lazy = await import("./lazy");',
  ].join("\n");

  assert.deepEqual(findImportSpecifiers(source, "a.test.tsx"), [
    "vitest",
    "./test-support/productsListScreen",
    "../fixtures",
    "./lazy",
  ]);
});

// collectImportedModules -------------------------------------------------------------------

test("collects the entry files and every local module they import, transitively", () => {
  const files = {
    "a.test.tsx": 'import "./helper";\nimport "vitest";\n',
    "helper.ts": 'import "./deeper";\n',
    "deeper.ts": "export const x = 1;\n",
  };
  const resolveImport = (specifier) =>
    ({ "./helper": "helper.ts", "./deeper": "deeper.ts" })[specifier];

  const modules = collectImportedModules(["a.test.tsx"], {
    resolveImport,
    readFile: (path) => files[path],
  });

  assert.deepEqual(modules, ["a.test.tsx", "deeper.ts", "helper.ts"]);
});

test("collects a module imported by several files, or in an import cycle, once", () => {
  const files = {
    "a.test.tsx": 'import "./helper";\n',
    "b.test.tsx": 'import "./helper";\n',
    "helper.ts": 'import "./a.test";\n',
  };
  const resolveImport = (specifier) =>
    ({ "./helper": "helper.ts", "./a.test": "a.test.tsx" })[specifier];

  const modules = collectImportedModules(["a.test.tsx", "b.test.tsx"], {
    resolveImport,
    readFile: (path) => files[path],
  });

  assert.deepEqual(modules, ["a.test.tsx", "b.test.tsx", "helper.ts"]);
});

test("passes each specifier to the resolver with the path of the file that imports it", () => {
  const files = { "dir/a.test.tsx": 'import "./helper";\n', "dir/helper.ts": "" };
  const calls = [];

  collectImportedModules(["dir/a.test.tsx"], {
    resolveImport: (specifier, fromPath) => {
      calls.push([specifier, fromPath]);
      return "dir/helper.ts";
    },
    readFile: (path) => files[path],
  });

  assert.deepEqual(calls, [["./helper", "dir/a.test.tsx"]]);
});

// createImportResolver ---------------------------------------------------------------------

test("resolves a relative import to the repository file it names", () => {
  const resolveImport = createImportResolver();

  assert.equal(
    resolveImport(
      "../ProductsListScreen",
      "apps/backoffice/src/test-support/productsListScreen.tsx",
    ),
    "apps/backoffice/src/ProductsListScreen.tsx",
  );
});

test("resolves a workspace package import to its source in the repository", () => {
  const resolveImport = createImportResolver();

  assert.equal(
    resolveImport("@purosur/ui", "apps/backoffice/src/ProductsListScreen.tsx"),
    "packages/ui/src/index.ts",
  );
});

test("does not resolve an import of an installed dependency", () => {
  const resolveImport = createImportResolver();

  assert.equal(resolveImport("vitest", "apps/backoffice/src/ProductsListScreen.tsx"), undefined);
});

test("does not resolve an import that names no file", () => {
  const resolveImport = createImportResolver();

  assert.equal(
    resolveImport("./does-not-exist", "apps/backoffice/src/ProductsListScreen.tsx"),
    undefined,
  );
});

// The guard itself: every browser test file in the repository and every local module it imports,
// scanned for real. This is what fails `pnpm verify` (via `node --test .github/scripts/*.test.mjs`)
// when a browser test, or a helper it imports, mocks a module instead of injecting its dependencies
// through a `services` prop.
test("no browser test file, nor any module it imports, registers a module mock", () => {
  const files = findBrowserTestFiles();
  assert.ok(files.length > 0, "expected to find at least one browser test file to scan");
  const modules = collectImportedModules(files, { resolveImport: createImportResolver() });
  assert.ok(
    modules.includes("apps/backoffice/src/test-support/productsListScreen.tsx"),
    "expected the scan to reach the modules browser tests import",
  );

  const violations = checkFiles(modules);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "Vitest browser mode does not reliably apply vi.mock factories; " +
      "inject the dependency through a services prop instead.",
  );
});
