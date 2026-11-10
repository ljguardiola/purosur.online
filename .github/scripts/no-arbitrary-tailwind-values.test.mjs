import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findArbitraryValues,
  findNumericZIndexUtilities,
  findScannedFiles,
} from "./no-arbitrary-tailwind-values.mjs";

const matchedTexts = (source) => findArbitraryValues(source).map((match) => match.text);

test("finds an arbitrary value after a utility", () => {
  assert.deepEqual(matchedTexts('<p className="text-[13px] font-bold" />'), ["-[13px]"]);
});

test("finds an arbitrary color, a variable and a calc", () => {
  const source = 'cn("bg-[#fff]", "w-[var(--x)]", "h-[calc(100%-2px)]")';

  assert.deepEqual(matchedTexts(source), ["-[#fff]", "-[var(--x)]", "-[calc(100%-2px)]"]);
});

test("finds an arbitrary data variant", () => {
  assert.deepEqual(matchedTexts('"data-[state=open]:bg-surface"'), ["-[state=open]"]);
});

test("finds an arbitrary variant that starts a class", () => {
  assert.deepEqual(matchedTexts('"[&>svg]:h-full"'), ["[&>svg]"]);
});

test("finds an arbitrary property that starts a class", () => {
  assert.deepEqual(matchedTexts("`flex [mask-type:luminance]`"), ["[mask-type:luminance]"]);
});

test("finds an arbitrary property after a space inside a class string", () => {
  assert.deepEqual(matchedTexts('"flex [mask-type:luminance]"'), ["[mask-type:luminance]"]);
});

test("finds a CSS variable shorthand after a utility", () => {
  assert.deepEqual(matchedTexts('cn("w-(--trigger-width)", "bg-(--x)")'), [
    "-(--trigger-width)",
    "-(--x)",
  ]);
});

test("finds an arbitrary variant or property after a variant", () => {
  assert.deepEqual(matchedTexts('"hover:[&>svg]:h-full data-selected:[mask-type:luminance]"'), [
    "[&>svg]",
    "[mask-type:luminance]",
  ]);
});

test("finds an arbitrary modifier and a CSS variable modifier", () => {
  assert.deepEqual(matchedTexts('"bg-surface/[0.5] text-ink/(--alpha)"'), ["/[0.5]", "/(--alpha)"]);
});

test("does not flag subtraction, division, indexing or ternaries", () => {
  const source = [
    "const a = total - (count);",
    "const b = total / (count);",
    "const g = total-(count) + total/(count);",
    "const c = items[i];",
    "const d = { key: [1] };",
    "const e = x ? [a] : [b];",
    'const f = "(?:[0-9a-f]{2})?";',
  ].join("\n");

  assert.deepEqual(findArbitraryValues(source), []);
});

test("reports the line and column where the match starts", () => {
  const source = ["const a = 1;", 'const b = "flex text-[13px]";'].join("\n");

  assert.deepEqual(findArbitraryValues(source), [{ line: 2, column: 21, text: "-[13px]" }]);
});

test("reports every match, on the same line or not", () => {
  const source = ['"w-[1px] h-[2px]"', '"p-[3px]"'].join("\n");

  assert.deepEqual(
    findArbitraryValues(source).map(({ line, column }) => [line, column]),
    [
      [1, 3],
      [1, 11],
      [2, 3],
    ],
  );
});

test("does not flag array and index access", () => {
  const source = ["const a = items[index];", "const b = array[0];", "const c = rows[i - 1];"].join(
    "\n",
  );

  assert.deepEqual(findArbitraryValues(source), []);
});

test("does not flag array types, tuples and literals", () => {
  const source = [
    "type A = Record<string, T>[];",
    "type B = readonly [string, number];",
    "const c = [1, 2, 3];",
    "const d = a - [1].length;",
    'const e = ["a", "b"];',
  ].join("\n");

  assert.deepEqual(findArbitraryValues(source), []);
});

test("does not flag an index signature", () => {
  assert.deepEqual(findArbitraryValues("type A = { [key: string]: number };"), []);
});

test("does not flag a computed property or a spread array", () => {
  assert.deepEqual(findArbitraryValues("const a = { [name]: 1, ...[x] };"), []);
});

test("does not flag a hyphenated name followed by a space before the bracket", () => {
  assert.deepEqual(findArbitraryValues('const label = "size - [none]";'), []);
});

const numericZIndexTexts = (source) =>
  findNumericZIndexUtilities(source).map((match) => match.text);

test("finds a numeric z-index utility", () => {
  assert.deepEqual(numericZIndexTexts('<div className="relative z-10" />'), ["z-10"]);
});

test("finds a negative numeric z-index utility", () => {
  assert.deepEqual(numericZIndexTexts('"-z-1 z-0"'), ["-z-1", "z-0"]);
});

test("finds a numeric z-index utility behind a variant, naming it with its variant", () => {
  assert.deepEqual(numericZIndexTexts('cn("hover:z-20", "md:focus:-z-5")'), [
    "hover:z-20",
    "md:focus:-z-5",
  ]);
});

test("finds a numeric z-index utility behind a child, named group, named peer or container variant", () => {
  assert.deepEqual(
    numericZIndexTexts(
      '"*:z-10 **:-z-1 group-hover/card:z-20 peer-checked/x:-z-1 @md:z-30 @max-lg/main:z-40"',
    ),
    [
      "*:z-10",
      "**:-z-1",
      "group-hover/card:z-20",
      "peer-checked/x:-z-1",
      "@md:z-30",
      "@max-lg/main:z-40",
    ],
  );
});

test("does not flag the z-index role utilities behind a child, named group or container variant", () => {
  assert.deepEqual(numericZIndexTexts('"*:z-raised group-hover/card:z-overlay @md:-z-raised"'), []);
});

test("finds a numeric z-index utility marked important", () => {
  assert.deepEqual(numericZIndexTexts('"z-10! !z-20 hover:!-z-1"'), [
    "z-10",
    "!z-20",
    "hover:!-z-1",
  ]);
});

test("does not flag the z-index role utilities", () => {
  assert.deepEqual(
    numericZIndexTexts('"z-raised focus:z-focused z-overlay md:z-popover -z-raised"'),
    [],
  );
});

test("does not flag a z followed by a number inside another word or expression", () => {
  const source = [
    'const a = "size-z-10 baz-10 z-10px z-10-x";',
    "const b = z - 10;",
    "const c = matrix.z-1;",
  ].join("\n");

  assert.deepEqual(findNumericZIndexUtilities(source), []);
});

test("reports the line and column where a numeric z-index utility starts", () => {
  const source = ["const a = 1;", 'const b = "flex hover:z-10";'].join("\n");

  assert.deepEqual(findNumericZIndexUtilities(source), [
    { line: 2, column: 17, text: "hover:z-10" },
  ]);
});

test("describes a violation with its file, position and text", () => {
  const description = describeViolation({ path: "a.tsx", line: 2, column: 5, text: "-[13px]" });

  assert.equal(description, "a.tsx:2:5: -[13px]");
});

test("reports the file of every match across several files", () => {
  const files = {
    "a.tsx": 'const a = "text-[13px]";\n',
    "b.tsx": 'const b = "text-body";\n',
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.deepEqual(violations, [{ path: "a.tsx", line: 1, column: 16, text: "-[13px]" }]);
});

test("reports the file of every numeric z-index utility beside the arbitrary values", () => {
  const files = {
    "a.tsx": 'const a = "z-10 text-[13px]";\n',
    "b.tsx": 'const b = "z-raised";\n',
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.deepEqual(violations, [
    { path: "a.tsx", line: 1, column: 21, text: "-[13px]" },
    { path: "a.tsx", line: 1, column: 12, text: "z-10" },
  ]);
});

test("scans the design system and the apps' screens, but not tests or CSS", () => {
  const tracked = [
    "packages/ui/src/components/forms/button.tsx",
    "packages/ui/src/components/forms/button.stories.tsx",
    "packages/ui/src/components/forms/button.test.tsx",
    "packages/ui/src/styles/tokens.css",
    "apps/backoffice/src/catalog/screen.tsx",
    "apps/backoffice/src/catalog/screen.test.ts",
    "apps/pos/src/renderer/App.tsx",
    "apps/pos/src/main/index.ts",
    "apps/cloud/src/server.ts",
  ];

  assert.deepEqual(
    findScannedFiles(".", () => tracked),
    [
      "apps/backoffice/src/catalog/screen.tsx",
      "apps/pos/src/renderer/App.tsx",
      "packages/ui/src/components/forms/button.stories.tsx",
      "packages/ui/src/components/forms/button.tsx",
    ],
  );
});

test("no design system or screen source uses a Tailwind arbitrary value or a numeric z-index", () => {
  const files = findScannedFiles();
  for (const sentinel of [
    "packages/ui/src/components/forms/button.tsx",
    "apps/backoffice/src/catalog/products-list-screen.tsx",
  ]) {
    assert.ok(files.includes(sentinel), `expected the scan to include ${sentinel}`);
  }

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "use a design-system token instead of an arbitrary value or a numeric z-index",
  );
});
