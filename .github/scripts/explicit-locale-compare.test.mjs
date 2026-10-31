import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findLocaleFreeComparisons,
  findScannedFiles,
} from "./explicit-locale-compare.mjs";

const lines = (source, fileName = "x.ts") =>
  findLocaleFreeComparisons(source, fileName).map((match) => match.line);

test("finds localeCompare called without a locale", () => {
  const source = ["const ok = 1;", "names.sort((a, b) => a.localeCompare(b));", ""].join("\n");

  assert.deepEqual(findLocaleFreeComparisons(source, "x.ts"), [
    { line: 2, text: "names.sort((a, b) => a.localeCompare(b));" },
  ]);
});

test("finds localeCompare called with no argument at all", () => {
  assert.deepEqual(lines("const order = text.localeCompare();"), [1]);
});

test("finds localeCompare called with undefined as the locale", () => {
  assert.deepEqual(lines("a.localeCompare(b, undefined);"), [1]);
  assert.deepEqual(lines("a.localeCompare(b, undefined, { numeric: true });"), [1]);
  assert.deepEqual(lines("a.localeCompare(b, void 0);"), [1]);
});

test("finds localeCompare called through optional chaining or a bracketed name", () => {
  assert.deepEqual(lines('a?.localeCompare(b);\na["localeCompare"](b);'), [1, 2]);
});

test("finds localeCompare called on any receiver", () => {
  const source = [
    "first.name.localeCompare(second.name);",
    "(a.id + a.kind).localeCompare(other);",
    "String(a).localeCompare(String(b));",
    "(a ?? '').localeCompare(b ?? '');",
  ].join("\n");

  assert.deepEqual(lines(source), [1, 2, 3, 4]);
});

test("finds localeCompare reached through String.prototype and call without a locale", () => {
  const source = [
    "String.prototype.localeCompare.call(a, b);",
    "String.prototype.localeCompare.call(a, b, undefined);",
    'String.prototype.localeCompare.call(a, b, "es-AR");',
  ].join("\n");

  assert.deepEqual(lines(source), [1, 2]);
});

test("finds an alias of localeCompare called through call without a locale", () => {
  const source = [
    "const compare = String.prototype.localeCompare;",
    "compare.call(a, b);",
    'compare.call(a, b, "es-AR");',
  ].join("\n");

  assert.deepEqual(lines(source), [2]);
});

test("finds a comparison given an empty list of locales", () => {
  const source = [
    "a.localeCompare(b, []);",
    "a.localeCompare(b, [], { numeric: true });",
    "String.prototype.localeCompare.call(a, b, []);",
    "const c = new Intl.Collator([], { numeric: true });",
    "const d = Intl.Collator([]);",
  ].join("\n");

  assert.deepEqual(lines(source), [1, 2, 3, 4, 5]);
});

test("finds nothing in localeCompare called with a locale", () => {
  const source = [
    'a.localeCompare(b, "es-AR");',
    'a.localeCompare(b, "en", { numeric: true });',
    "a.localeCompare(b, locale);",
    'a.localeCompare(b, ["es-AR", "es"]);',
  ].join("\n");

  assert.deepEqual(lines(source), []);
});

test("finds Intl.Collator constructed or called without a locale", () => {
  const source = [
    "const a = new Intl.Collator();",
    "const b = new Intl.Collator;",
    "const c = Intl.Collator();",
    "const d = new Intl.Collator(undefined, { numeric: true });",
    "const e = Intl.Collator(void 0);",
  ].join("\n");

  assert.deepEqual(lines(source), [1, 2, 3, 4, 5]);
});

test("finds nothing in Intl.Collator constructed or called with a locale", () => {
  const source = [
    'const a = new Intl.Collator("es-AR");',
    'const b = new Intl.Collator("es-AR", { numeric: true });',
    'const c = Intl.Collator("en");',
    "const d = new Intl.Collator(locale);",
  ].join("\n");

  assert.deepEqual(lines(source), []);
});

test("finds the constructor reached through a renamed or namespaced Intl", () => {
  const source = [
    "const International = Intl;",
    "const a = new International.Collator();",
    "const b = new globalThis.Intl.Collator();",
    'const c = new globalThis["Intl"]["Collator"]();',
  ].join("\n");

  assert.deepEqual(lines(source), [2, 3, 4]);
});

test("finds the constructor reached through an alias or a destructured binding", () => {
  const source = [
    "const Collator = Intl.Collator;",
    "const { Collator: Renamed } = Intl;",
    "const SameCollator = Collator;",
    "const a = new Collator();",
    "const b = new Renamed();",
    "const c = SameCollator();",
    'const d = new Collator("es-AR");',
  ].join("\n");

  assert.deepEqual(lines(source), [4, 5, 6]);
});

test("finds nothing in a constructor of another name or text that only reads like a call", () => {
  const source = [
    "const a = new Intl.NumberFormat();",
    "const b = new Collator();",
    "// a.localeCompare(b)",
    'const c = "new Intl.Collator()";',
    "const d = `a.localeCompare(b)`;",
  ].join("\n");

  assert.deepEqual(lines(source), []);
});

test("finds a call in a TSX file", () => {
  const source = "const list = <List items={items.sort((a, b) => a.localeCompare(b))} />;";

  assert.deepEqual(lines(source, "x.tsx"), [1]);
});

test("finds a call spread over several lines on the line it starts", () => {
  const source = ["const order = first.name.localeCompare(", "  second.name,", ");"].join("\n");

  assert.deepEqual(lines(source), [1]);
});

test("reports every violation with its file and line, in test files too", () => {
  const files = {
    "a.test.ts": "expect(names.sort((a, b) => a.localeCompare(b))).toEqual([]);",
    "b.mjs": 'names.sort((a, b) => a.localeCompare(b, "en"));',
    "c.cjs": "module.exports = new Intl.Collator();",
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.deepEqual(violations.map(describeViolation), [
    "a.test.ts:1: expect(names.sort((a, b) => a.localeCompare(b))).toEqual([]);",
    "c.cjs:1: module.exports = new Intl.Collator();",
  ]);
});

test("scans every tracked TypeScript and JavaScript source and nothing else", () => {
  const tracked = [
    "packages/a/x.ts",
    "packages/a/x.tsx",
    "packages/a/x.mts",
    "packages/a/x.mjs",
    "packages/a/x.js",
    "packages/a/x.cjs",
    "packages/a/x.test.ts",
    "packages/a/x.md",
    "packages/a/x.json",
  ];

  assert.deepEqual(
    findScannedFiles(".", () => tracked),
    [
      "packages/a/x.cjs",
      "packages/a/x.js",
      "packages/a/x.mjs",
      "packages/a/x.mts",
      "packages/a/x.test.ts",
      "packages/a/x.ts",
      "packages/a/x.tsx",
    ],
  );
});

test("no source in the repository compares text by the machine's locale", () => {
  const files = findScannedFiles();
  for (const sentinel of [
    "packages/domain/src/shared/text-order.ts",
    "packages/ui/src/ordering/item-ordering.ts",
    "apps/backoffice/src/pricing/discounts-list-screen.tsx",
    "apps/cloud/src/register/drizzle-register-store.test.ts",
    ".github/scripts/pulled-table-redelivery.mjs",
  ]) {
    assert.ok(files.includes(sentinel), `expected the scan to include ${sentinel}`);
  }

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    'pass the locale ("es-AR") or compareSpanishText for text people read, and compare ids, dates and codes by their code units',
  );
});
