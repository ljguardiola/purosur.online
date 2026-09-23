import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findBrowserTestFiles,
  findViMockCalls,
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

test("does not mistake a services field literally named mock for vi.mock", () => {
  assert.deepEqual(findViMockCalls("const notAMock = { vimock: vi.fn() };"), []);
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
