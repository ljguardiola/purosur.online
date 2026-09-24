import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findBrowserTestFiles,
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

test("fails when the Vitest config has no browser project include", () => {
  assert.throws(
    () => readBrowserTestGlobs('export default { test: { name: "node" } };'),
    /browser project/,
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

// The guard itself: every browser test file in the repository, scanned for real. This is what
// fails `pnpm verify` (via `node --test .github/scripts/*.test.mjs`) when a browser test mocks a
// module instead of injecting its dependencies through a `services` prop.
test("no packages/*/src or apps/*/src browser test file calls vi.mock", () => {
  const files = findBrowserTestFiles();
  assert.ok(files.length > 0, "expected to find at least one browser test file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "Vitest browser mode does not reliably apply vi.mock factories; " +
      "inject the dependency through a services prop instead.",
  );
});
