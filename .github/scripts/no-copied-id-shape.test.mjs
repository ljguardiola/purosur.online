import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  findIdShapeCopies,
  findScannedFiles,
  ID_SHAPE_PATH,
} from "./no-copied-id-shape.mjs";

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "../..");

const PLATFORM_PATTERN = "/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i";

const linesOf = (source) => findIdShapeCopies(source, "source.ts").map(({ line }) => line);

test("finds a copied regular expression literal with the line it is on", () => {
  const source = ['import { z } from "zod";', "", `const ID = ${PLATFORM_PATTERN};`].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

test("finds a copy spelled with other cases, flags or character classes", () => {
  for (const pattern of [
    "/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/",
    "/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/",
    "/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/",
    "/^[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}$/iu",
    "/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi",
    "/^\\p{AHex}{8}-\\p{AHex}{4}-\\p{AHex}{4}-\\p{AHex}{4}-\\p{AHex}{12}$/u",
    "/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i",
    "/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i",
    "/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/",
    "/^[0-9a-f-]{36}$/i",
  ]) {
    assert.deepEqual(linesOf(`const ID = ${pattern};`), [1], pattern);
  }
});

test("finds the shape embedded in a larger pattern", () => {
  const source =
    "const ROUTE = /^\\/products\\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\/prices$/;";

  assert.deepEqual(linesOf(source), [1]);
});

test("finds a copy written as the string a RegExp is built from", () => {
  for (const source of [
    'const ID = new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", "i");',
    'const ID = RegExp("[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}");',
    "const ID = new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`);",
    'const ID = new RegExp("^[\\\\da-f]{8}-[\\\\da-f]{4}-[\\\\da-f]{4}-[\\\\da-f]{4}-[\\\\da-f]{12}$");',
  ]) {
    assert.deepEqual(linesOf(source), [1], source);
  }
});

test("finds a copy spelled out one character class per digit", () => {
  const group = (length) => "[0-9a-f]".repeat(length);
  const pattern = `/^${[8, 4, 4, 4, 12].map(group).join("-")}$/i`;

  assert.deepEqual(linesOf(`const ID = ${pattern};`), [1]);
});

test("finds a copy written as the raw text of a template", () => {
  const source =
    "const ID = new RegExp(String.raw`^[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}$`);";

  assert.deepEqual(linesOf(source), [1]);
});

test("finds a copy in the literal parts of a template whose substitution is not a constant of the file", () => {
  const source = [
    'import { base } from "./routes";',
    "const ROUTE = new RegExp(",
    `  \`^\${base}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$\`,`,
    ");",
  ].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

test("finds a copy assembled from pieces held in constants of the same file", () => {
  const source = [
    'const HEX = "[0-9a-f]";',
    `const GROUPS = \`\${HEX}{8}-\${HEX}{4}-\${HEX}{4}\`;`,
    "const ID = new RegExp(",
    `  "^" + GROUPS + \`-\${HEX}{4}-\${HEX}{12}$\`,`,
    '  "i",',
    ");",
  ].join("\n");

  assert.deepEqual(linesOf(source), [4]);
});

test("finds a copy whose group lengths are numbers substituted into the pattern", () => {
  const source = [
    "const FIRST_GROUP = 8;",
    "const ID = new RegExp(",
    `  \`^[0-9a-f]{\${FIRST_GROUP}}-[0-9a-f]{\${4}}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\`,`,
    ");",
  ].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

test("ignores UUID values used as test data", () => {
  const source = [
    'const PRODUCT_ID = "0123abcd-ef01-4567-89ab-cdef01234567";',
    'const OTHER_ID = "FEDCBA98-7654-4A21-BA98-76543210FEDC";',
    `const path = \`/products/\${PRODUCT_ID}/prices/00000000-0000-0000-0000-000000000000\`;`,
    "expect(body.id).toMatch(/^0123abcd-ef01-4567-89ab-cdef01234567$/);",
    'const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];',
    "expect(body.ids).toMatch(/^(0123abcd-ef01-4567-89ab-cdef01234567,?)+$/);",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("ignores patterns of other shapes", () => {
  const source = [
    "const CUIT = /^(?<prefix>\\d{2})-(?<body>\\d{8})-(?<checkDigit>\\d)$/;",
    "const ANY = /.+/;",
    "const HEX = /^[0-9a-f]+$/i;",
    "const HYPHENATED_HEX = /^[0-9a-f-]+$/i;",
    "const COLOR = /^#[0-9a-f]{6}$/i;",
    'const SQL = "select id from products where id = $1";',
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("does not count a zod uuid format as a copy of the database id shape", () => {
  const source = [
    'import { z } from "zod";',
    "export const payload = z.object({ requestId: z.uuid(), other: z.string().uuid() });",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("recognizes the platform file's own pattern as the shape", () => {
  const source = readFileSync(join(repoRoot, ID_SHAPE_PATH), "utf8");

  assert.notDeepEqual(findIdShapeCopies(source, ID_SHAPE_PATH), []);
});

test("reports each file and line holding a copy", () => {
  const files = {
    "apps/cloud/src/a.test.ts": `x();\nconst ID = ${PLATFORM_PATTERN};`,
    "apps/cloud/src/b.ts": "z();",
  };

  assert.deepEqual(
    checkFiles(Object.keys(files), (path) => files[path]),
    [
      `apps/cloud/src/a.test.ts:2 holds a copy of the database id shape, which lives only in ${ID_SHAPE_PATH}`,
    ],
  );
});

test("scans every cloud source file, tests included, except the platform file", () => {
  const scanned = findScannedFiles(repoRoot);

  assert.ok(scanned.includes("apps/cloud/src/catalog/drizzle-catalog-store.ts"));
  assert.ok(scanned.includes("apps/cloud/src/catalog/drizzle-catalog-store.test.ts"));
  assert.ok(scanned.every((path) => path.startsWith("apps/cloud/src/")));
  assert.ok(!scanned.includes(ID_SHAPE_PATH));
});

test("no cloud file outside the database platform code holds a copy of the id shape", () => {
  const readFile = (path) => readFileSync(join(repoRoot, path), "utf8");

  assert.deepEqual(checkFiles(findScannedFiles(repoRoot), readFile), []);
});
