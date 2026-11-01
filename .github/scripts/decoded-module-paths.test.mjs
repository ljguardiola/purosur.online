import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findScannedFiles,
  findUndecodedModulePaths,
} from "./decoded-module-paths.mjs";

const lines = (source, fileName = "x.mjs") =>
  findUndecodedModulePaths(source, fileName).map((match) => match.line);

test("finds the pathname of the module's own URL", () => {
  const source = [
    'import { dirname } from "node:path";',
    "const root = dirname(new URL(import.meta.url).pathname);",
    "",
  ].join("\n");

  assert.deepEqual(findUndecodedModulePaths(source, "x.mjs"), [
    { line: 2, text: "const root = dirname(new URL(import.meta.url).pathname);" },
  ]);
});

test("finds the pathname of a URL resolved against the module's URL", () => {
  const source = [
    'const root = new URL("../..", import.meta.url).pathname;',
    'const file = (new URL("./x.json", import.meta.url))["pathname"];',
  ].join("\n");

  assert.deepEqual(lines(source), [1, 2]);
});

test("finds the pathname read through a variable holding the module's URL", () => {
  const source = [
    "const here = new URL(import.meta.url);",
    "const same = here;",
    "readFileSync(here.pathname);",
    "readFileSync(same.pathname);",
  ].join("\n");

  assert.deepEqual(lines(source), [3, 4]);
});

test("finds the pathname destructured from the module's URL", () => {
  const source = [
    "const { pathname } = new URL(import.meta.url);",
    'const { pathname: root } = new URL("../..", import.meta.url);',
    "const here = new URL(import.meta.url);",
    "const { pathname: again } = here;",
  ].join("\n");

  assert.deepEqual(lines(source), [1, 2, 4]);
});

test("finds the pathname in TypeScript files", () => {
  assert.deepEqual(lines("const root = (new URL(import.meta.url) as URL).pathname;", "x.ts"), [1]);
});

test("finds nothing when the module's location is decoded", () => {
  const source = [
    'import { fileURLToPath } from "node:url";',
    "const root = fileURLToPath(new URL(import.meta.url));",
    'const parent = fileURLToPath(new URL("../..", import.meta.url));',
    'const text = readFileSync(new URL("./x.json", import.meta.url), "utf8");',
    'const href = new URL("./x.mjs", import.meta.url).href;',
  ].join("\n");

  assert.deepEqual(lines(source), []);
});

test("finds nothing in the pathname of a URL that is not the module's", () => {
  const source = [
    "const path = new URL(request.url).pathname;",
    'const api = new URL("/api/x", "http://localhost").pathname;',
    "const here = new URL(import.meta.url);",
    "const other = new URL(response.url);",
    "assert.equal(other.pathname, '/x');",
  ].join("\n");

  assert.deepEqual(lines(source), []);
});

test("checkFiles reports each finding with its path", () => {
  const files = {
    "a.mjs": "const root = new URL(import.meta.url).pathname;",
    "b.mjs": "const root = fileURLToPath(new URL(import.meta.url));",
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.deepEqual(violations.map(describeViolation), [
    "a.mjs:1: const root = new URL(import.meta.url).pathname;",
  ]);
});

test("scans tracked script and source files only", () => {
  const tracked = [
    ".github/scripts/x.mjs",
    "packages/a/x.ts",
    "packages/a/x.tsx",
    "packages/a/x.mts",
    "packages/a/x.js",
    "packages/a/x.cjs",
    "packages/a/x.md",
    "packages/a/x.json",
  ];

  assert.deepEqual(
    findScannedFiles(".", () => tracked),
    [
      ".github/scripts/x.mjs",
      "packages/a/x.cjs",
      "packages/a/x.js",
      "packages/a/x.mts",
      "packages/a/x.ts",
      "packages/a/x.tsx",
    ],
  );
});

test("no file in the repository reads its own location without decoding it", () => {
  const files = findScannedFiles();
  for (const sentinel of [
    ".github/scripts/only-fictional-cuits.test.mjs",
    ".claude/hooks/pretool.mjs",
    "apps/pos/scripts/generate-receipt-logo.ts",
    "packages/contracts/src/sync/test-support/recorded-pushes.ts",
  ]) {
    assert.ok(files.includes(sentinel), `expected the scan to include ${sentinel}`);
  }

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "a URL's pathname keeps characters percent-encoded: use fileURLToPath(new URL(..., import.meta.url))",
  );
});
