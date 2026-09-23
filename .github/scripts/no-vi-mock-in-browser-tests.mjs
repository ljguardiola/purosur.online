import { globSync, readFileSync } from "node:fs";

// Vitest browser mode intermittently does not apply a test file's `vi.mock` factories: the real
// modules load instead, and every test in the file fails. Browser tests inject their dependencies
// through a component's `services` prop instead of mocking modules.
export const BROWSER_TEST_GLOBS = ["packages/*/src/**/*.test.tsx", "apps/*/src/**/*.test.tsx"];

const VI_MOCK_PATTERN = /\bvi\s*\.\s*mock\s*\(/;

/** Lines in a browser test file's source that call `vi.mock(...)`, 1-indexed. */
export function findViMockCalls(source) {
  return source
    .split("\n")
    .map((text, index) => ({ line: index + 1, text: text.trim() }))
    .filter(({ text }) => VI_MOCK_PATTERN.test(text));
}

/** Scans the given file paths and returns one violation per `vi.mock(...)` call found. */
export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findViMockCalls(readFile(path)).map((match) => ({ path, ...match })),
  );
}

export function findBrowserTestFiles(cwd = process.cwd()) {
  return globSync(BROWSER_TEST_GLOBS, { cwd }).sort();
}

export function describeViolation({ path, line, text }) {
  return `${path}:${line}: ${text}`;
}
