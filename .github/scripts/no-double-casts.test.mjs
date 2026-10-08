import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findDoubleCasts,
  findScannedFiles,
} from "./no-double-casts.mjs";

test("finds a cast to a type through unknown written with as", () => {
  const source = ["const first = 1;", "const value = first as unknown as string;", ""].join("\n");

  assert.deepEqual(findDoubleCasts(source, "x.ts"), [
    { line: 2, text: "const value = first as unknown as string;" },
  ]);
});

test("finds a cast to a type through unknown written with angle brackets", () => {
  assert.equal(findDoubleCasts("const value = <string>(<unknown>first);", "x.ts").length, 1);
});

test("finds a cast through unknown that mixes both syntaxes", () => {
  assert.equal(findDoubleCasts("const value = <string>(first as unknown);", "x.ts").length, 1);
  assert.equal(findDoubleCasts("const value = (<unknown>first) as string;", "x.ts").length, 1);
});

test("finds a cast through unknown whose inner cast is wrapped in parentheses", () => {
  assert.equal(findDoubleCasts("const value = ((first as unknown)) as string;", "x.ts").length, 1);
});

test("finds a cast through unknown whose inner cast is asserted non-null", () => {
  assert.equal(findDoubleCasts("const value = (first as unknown)! as string;", "x.ts").length, 1);
});

test("finds a cast through unknown to a type that itself names unknown", () => {
  const source = "const value = first as unknown as Record<string, unknown>;";

  assert.equal(findDoubleCasts(source, "x.ts").length, 1);
});

test("finds a cast through unknown in a TSX file", () => {
  const source = "const element = <div ref={(node as unknown as HTMLDivElement)} />;";

  assert.equal(findDoubleCasts(source, "x.tsx").length, 1);
});

test("finds a cast through unknown spread over several lines on the line it starts", () => {
  const source = ["const value = {", "  id: 1,", "} as unknown as Session;"].join("\n");

  assert.deepEqual(
    findDoubleCasts(source, "x.ts").map((match) => match.line),
    [1],
  );
});

test("finds every cast through unknown in a file with more than one", () => {
  const source = ["const a = x as unknown as A;", "const b = y as unknown as B;"].join("\n");

  assert.deepEqual(
    findDoubleCasts(source, "x.ts").map((match) => match.line),
    [1, 2],
  );
});

test("finds nothing in a single cast, a cast to unknown, or a type that names unknown", () => {
  const source = [
    "const a = first as string;",
    "const b = first as unknown;",
    "const c = <unknown>first;",
    "const d = [1] as const;",
    "const e: Promise<unknown> = load();",
    "const f = (first satisfies unknown) as string;",
    "const g = deferred<unknown>();",
  ].join("\n");

  assert.deepEqual(findDoubleCasts(source, "x.ts"), []);
});

test("finds nothing in a double cast through a type other than unknown", () => {
  assert.deepEqual(findDoubleCasts("const value = first as Base as Derived;", "x.ts"), []);
});

test("finds nothing in text that only reads like a cast", () => {
  const source = [
    "// first as unknown as string",
    'const message = "first as unknown as string";',
    "const template = `first as unknown as string`;",
  ].join("\n");

  assert.deepEqual(findDoubleCasts(source, "x.ts"), []);
});

test("reports every violation with its file and line", () => {
  const files = { "a.ts": "const value = first as unknown as string;", "b.ts": "const ok = 1;" };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.deepEqual(violations.map(describeViolation), [
    "a.ts:1: const value = first as unknown as string;",
  ]);
});

test("scans every tracked TypeScript source and nothing else", () => {
  const tracked = [
    ".railway/railway.ts",
    "apps/pos/src/renderer/main.tsx",
    "packages/a/x.cts",
    "packages/a/x.mts",
    "packages/a/x.d.ts",
    "packages/a/x.js",
    "packages/a/x.mjs",
    "packages/a/x.md",
    "packages/a/x.json",
  ];

  assert.deepEqual(
    findScannedFiles(".", () => tracked),
    [
      ".railway/railway.ts",
      "apps/pos/src/renderer/main.tsx",
      "packages/a/x.cts",
      "packages/a/x.d.ts",
      "packages/a/x.mts",
    ],
  );
});

test("no TypeScript source in the repository casts a value through unknown", () => {
  const files = findScannedFiles();
  for (const sentinel of [
    "apps/pos/src/renderer/main.tsx",
    "apps/pos/e2e/core-recovery.e2e.test.ts",
    "apps/cloud/src/test-support/build-test-app.ts",
    "packages/ui/src/test/setup-browser.ts",
    ".railway/railway.ts",
  ]) {
    assert.ok(files.includes(sentinel), `expected the scan to include ${sentinel}`);
  }

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "give the value its right type: a complete typed fake, a typed factory, a narrowing check or a schema parse",
  );
});
