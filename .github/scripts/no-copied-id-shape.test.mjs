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

const CASE_FILE = "apps/cloud/src/id-shape-check.ts";

const linesOf = (source) =>
  findIdShapeCopies({ [CASE_FILE]: source }, repoRoot).map(({ line }) => line);

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

const withLastGroupLength = (substitution) =>
  [
    "const LAST_GROUP = 8;",
    "const ID = new RegExp(",
    `  \`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{\${${substitution}}}$\`,`,
    ");",
  ].join("\n");

test("reads a sum of numbers substituted into a pattern as the number it adds up to", () => {
  for (const substitution of ["4 + 8", "LAST_GROUP + 4", "(2 + 2) + LAST_GROUP", "11 + 1"]) {
    assert.deepEqual(linesOf(withLastGroupLength(substitution)), [3], substitution);
  }
  for (const substitution of ["1 + 2", "LAST_GROUP + 2"]) {
    assert.deepEqual(linesOf(withLastGroupLength(substitution)), [], substitution);
  }
});

test("reads a number added to a string as its digits", () => {
  for (const substitution of ['"1" + 2', '1 + "2"', "1 + `2`"]) {
    assert.deepEqual(linesOf(withLastGroupLength(substitution)), [3], substitution);
  }
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

const ZOD_ID_FORMATS = [
  ['import { z } from "zod";\nconst id = z.uuid();', [2]],
  ['import { z } from "zod";\nconst id = z.guid({ error: "id must be an id" });', [2]],
  ['import { z } from "zod";\nconst id = z.string().uuid();', [2]],
  ['import { z } from "zod";\nconst id = z.string().min(1).guid();', [2]],
  ['import { z } from "zod";\nconst id = z.uuidv4();', [2]],
  ['import { z } from "zod";\nconst id = z.uuidv7();', [2]],
  ['import { z } from "zod";\nconst id = z.string().regex(z.regexes.uuid());', [2]],
  ['import { z } from "zod";\nconst id = z.string().regex(z.regexes.guid);', [2]],
  ['import { guid as anyId } from "zod";\nregister(anyId);', [1, 2]],
  ['import { _guid } from "zod/v4/core";\nconst id = _guid;', [1, 2]],
  ['import { z } from "zod";\nconst id = z.core._uuid;', [2]],
  ['import { ZodMiniUUID } from "zod/mini";', [1]],
  ['import { z } from "zod";\nconst id = z.string().check(z.core.regexes.guid);', [2]],
  ['import { z } from "zod";\nconst id = new z.ZodGUID({ type: "string" });', [2]],
  ['import * as z from "zod/v4";\nconst id = z.guid();', [2]],
  ['import { z } from "zod/mini";\nconst id = z.uuid();', [2]],
  ['import zod from "zod";\nconst id = zod.guid();', [2]],
  ['import { guid as anyId } from "zod";\nconst id = anyId();', [1, 2]],
  ['import { regexes } from "zod/v4/core";\nconst id = regexes.uuid4;', [2]],
  ['import { z } from "zod";\nconst text = z.string();\nconst id = text.uuid();', [3]],
  ['import { z } from "zod";\nconst { guid } = z;\nconst id = guid();', [3]],
  [
    'import { z } from "zod";\nconst text = () => z.string();\nexport const id = text().guid();',
    [3],
  ],
  ['const { z } = await import("zod");\nexport const id = z.guid();', [2]],
  ['export const id = (await import("zod")).z.guid();', [1]],
  ['export { guid } from "zod";', [1]],
  ['export { uuid as anyId } from "zod/v4";', [1]],
];

test("finds a zod uuid or guid format called or referenced as a value, however it is reached", () => {
  for (const [source, lines] of ZOD_ID_FORMATS) {
    assert.deepEqual(linesOf(source), lines, source);
  }
});

test("ignores values and types whose type is no name of zod's id formats", () => {
  const source = [
    'import { z, ZodError } from "zod";',
    `declare function join<A extends string, B extends string>(a: A, b: B): \`\${A}\${B}\`;`,
    "declare const text: string;",
    'export const joined = join(text, "id");',
    'export const owner = join("owner", "Uuid");',
    'export const plain = [text, "id"].join("");',
    "export const picked = (z as Record<string, unknown>)[text];",
    `type Join<A extends string, B extends string> = \`\${A}\${B}\`;`,
    'export type Owner = Join<"owner", "Uuid">;',
    "export const error = new ZodError([]);",
    "export const never = z.NEVER;",
    "export const make = z.string;",
    "export const name = z.string().min(1);",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("ignores zod values and schemas given to zod's own types or to types that ask no id format", () => {
  const source = [
    'import { z } from "zod";',
    'import { recordIdSchema } from "../../../packages/contracts/src/shared/index.js";',
    "function keep(text: z.ZodString) {",
    "  return text;",
    "}",
    "keep(z.string());",
    "export const kept: z.ZodString = z.string();",
    "export const tools: typeof z = z;",
    "type Owner = { ownerUuid: string };",
    'export const owner: Owner = z.object({ ownerUuid: z.string() }).parse({ ownerUuid: "" });',
    "export const ids: { id: z.ZodType } = { id: recordIdSchema() };",
    "export const id: z.ZodType = recordIdSchema();",
    "keep(recordIdSchema());",
    "type Row = { guidance: string };",
    'export const row: Row = { guidance: "" };',
    "function store(entry: { guidance: number }) {",
    "  return entry;",
    "}",
    "store({ guidance: 1 });",
    "const rows = { a: { guidance: 1 } };",
    "export const nested: { a: { guidance: number } } = rows;",
    "type Tree = { guidance: string; children: Tree[] };",
    'const tree = { guidance: "", children: [] as Tree[] };',
    "export const root: Tree = tree;",
    "export const schemas: { a: { b: z.ZodString } } = { a: { b: recordIdSchema() } };",
    "export const texts = [z.string()].map((text: z.ZodString) => text.min(1));",
    "export const guids = [row].map((entry: { guidance: string }) => entry.guidance);",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("ignores calls of values built from the shared shape and of zod's other functions", () => {
  const source = [
    'import { z, ZodError } from "zod";',
    'import { recordIdSchema } from "../../../packages/contracts/src/shared/index.js";',
    "export const id = recordIdSchema();",
    "export const parsed = id.parse(null);",
    "export const lowered = recordIdSchema().optional().parse(null);",
    "export const body = z.object({ id: recordIdSchema(), other: id });",
    "export const error = new ZodError([]);",
    "const text = z.string;",
    "export const name = text().min(1);",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("ignores values of the shared shape, their methods and zod's other values", () => {
  const source = [
    'import { z, ZodError } from "zod";',
    'import { recordIdSchema } from "../../../packages/contracts/src/shared/index.js";',
    "const id = recordIdSchema();",
    "export const parse = id.parse;",
    "export const optional = recordIdSchema().optional;",
    "export const check = recordIdSchema().check;",
    "export const methods = [id.safeParse, id.nullable, recordIdSchema];",
    "export const text = z.string();",
    "export const error = ZodError;",
    "export const errors = [new ZodError([]), z.ZodError];",
    "export const never = z.NEVER;",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

const A_FILE = "apps/cloud/src/id-shape-check-a.ts";
const B_FILE = "packages/contracts/src/id-shape-check-b.ts";

const reportsOf = (a, b) =>
  findIdShapeCopies({ [A_FILE]: a, [B_FILE]: b }, repoRoot).map(
    ({ path, line }) => `${path}:${line}`,
  );

test("finds a zod id format reached through a value or a re-export of another file", () => {
  for (const [a, b, reports] of [
    [
      'import { z } from "zod";\nexport const requiredText = () => z.string();',
      'import { requiredText } from "../../../apps/cloud/src/id-shape-check-a.js";\nexport const id = requiredText().guid();',
      [`${B_FILE}:2`],
    ],
    [
      'import { z } from "zod";\nexport const text = z.string();',
      'import { text } from "../../../apps/cloud/src/id-shape-check-a.js";\nexport const id = text.uuid();',
      [`${B_FILE}:2`],
    ],
    [
      'export { z } from "zod";',
      'import { z } from "../../../apps/cloud/src/id-shape-check-a.js";\nexport const id = z.guid();',
      [`${B_FILE}:2`],
    ],
    [
      'export { guid } from "zod";',
      'import { guid } from "../../../apps/cloud/src/id-shape-check-a.js";\nexport const id = guid();',
      [`${A_FILE}:1`, `${B_FILE}:1`, `${B_FILE}:2`],
    ],
    [
      'import { z } from "zod";\nexport default z;',
      'import zod from "../../../apps/cloud/src/id-shape-check-a.js";\nexport const id = zod.uuid();',
      [`${B_FILE}:2`],
    ],
  ]) {
    assert.deepEqual(reportsOf(a, b), reports, b);
  }
});

test("ignores zod used for anything but an id format, however it is taken or passed on", () => {
  const source = [
    'import { z, ZodError, string, NEVER } from "zod";',
    'import type { ZodType } from "zod";',
    "export const s = z.object({ id: z.string() });",
    "export const listed = z.array(s).min(1);",
    "export type S = z.infer<typeof s>;",
    "export const parse = (schema: ZodType, input: unknown) => schema.parse(input);",
    "export const isInvalid = (error: unknown) => error instanceof ZodError;",
    "export const isZodError = (error: unknown) => error instanceof z.ZodError;",
    "register(string);",
    "register(z.string, z.iso, z.coerce, z.locales);",
    "export const refuse = () => z.NEVER;",
    "export const never = NEVER;",
    "export const zod = { z };",
    "export function tools() {",
    "  return z;",
    "}",
    "declare function register(...values: unknown[]): void;",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("ignores exported schemas built with zod and re-exports of zod that reach no id format", () => {
  const source = [
    'import { z } from "zod";',
    'export { z } from "zod";',
    'export * from "zod";',
    'export * as zod from "zod/mini";',
    'export type { ZodType } from "zod";',
    'export { uuid } from "drizzle-orm/pg-core";',
    "export const nameSchema = z.string().min(1);",
    "const priceSchema = z.object({ cents: z.number().int() });",
    "export { priceSchema };",
    "export default priceSchema;",
    "export type Price = z.infer<typeof priceSchema>;",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("ignores another package's uuid and names that hold uuid or guid without being zod's", () => {
  const source = [
    'import { uuid } from "drizzle-orm/pg-core";',
    'import { z } from "zod";',
    "const owner = z.object({ ownerUuid: z.string(), guidance: z.string() });",
    "export const field = owner.shape.ownerUuid;",
    'export const other = owner.shape["guidance"];',
    "export const { ownerUuid } = owner.shape;",
    'export const id = uuid("id").primaryKey().defaultRandom();',
    "export const generated = crypto.randomUUID();",
    "const row = { rowUuid: 1, guidId: 2 };",
    "export const stored = row.rowUuid ?? row.guidId;",
    'const key = "rowUuid";',
    "export const picked = row[key];",
    "export const { [key]: destructured } = row;",
    "declare const rowKey: keyof typeof row;",
    "export const any = row[rowKey];",
    'export const message = "not-a-uuid";',
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("ignores zod's id format types, in annotations, type queries and type-only imports", () => {
  const source = [
    'import { z } from "zod";',
    'import type { ZodUUID } from "zod";',
    'import { type ZodGUID } from "zod/v4";',
    'import { recordIdSchema } from "../../../packages/contracts/src/shared/index.js";',
    'export type { ZodGUID as Guid } from "zod";',
    "export const s: z.ZodGUID = recordIdSchema();",
    "export type Format = typeof z.uuid;",
    "export type Other = ZodUUID | z.core.$ZodUUIDDef;",
    "export type Query = typeof z.core.regexes.guid;",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("ignores a data field named uuid or guid", () => {
  const source = [
    "const row = { uuid: 1, guid: 2 };",
    "export const stored = row.uuid ?? row.guid;",
    "type Row = { uuidv7: string };",
    'export const typed: Row = { uuidv7: "" };',
    "export const { uuid } = row;",
    'export const picked = row["guid"];',
    "export const holder = { ZodUUID: 1, _uuid: 2, $ZodGUID: 3, uuid4: 4 };",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("finds a zod id format on the line it is used", () => {
  const source = [
    'import { z } from "zod";',
    "",
    "export const payload = z.object({",
    "  requestId: z.uuid(),",
    "});",
  ].join("\n");

  assert.deepEqual(linesOf(source), [4]);
});

test("recognizes the shared shape's own file as the shape", () => {
  const source = readFileSync(join(repoRoot, ID_SHAPE_PATH), "utf8");

  assert.notDeepEqual(findIdShapeCopies({ [ID_SHAPE_PATH]: source }, repoRoot), []);
});

test("reports each file and line holding a copy, except in the shared shape's file", () => {
  const files = {
    "apps/cloud/src/a.test.ts": `x();\nconst ID = ${PLATFORM_PATTERN};`,
    "packages/contracts/src/b.ts": 'import { z } from "zod";\nconst id = z.guid();',
    "apps/cloud/src/c.ts": "z();",
    [ID_SHAPE_PATH]: readFileSync(join(repoRoot, ID_SHAPE_PATH), "utf8"),
  };

  assert.deepEqual(
    checkFiles(Object.keys(files), (path) => files[path], repoRoot),
    [
      `apps/cloud/src/a.test.ts:2 holds a copy of the record id shape, which lives only in ${ID_SHAPE_PATH}`,
      `packages/contracts/src/b.ts:2 holds a copy of the record id shape, which lives only in ${ID_SHAPE_PATH}`,
    ],
  );
});

test("scans every cloud and contracts source file, tests and the shared shape's file included", () => {
  const scanned = findScannedFiles(repoRoot);

  assert.ok(scanned.includes("apps/cloud/src/catalog/drizzle-catalog-store.ts"));
  assert.ok(scanned.includes("apps/cloud/src/catalog/drizzle-catalog-store.test.ts"));
  assert.ok(scanned.includes("packages/contracts/src/shared/index.ts"));
  assert.ok(scanned.includes("packages/contracts/src/shared/record-id.test.ts"));
  assert.ok(scanned.includes(ID_SHAPE_PATH));
  assert.ok(
    scanned.every(
      (path) => path.startsWith("apps/cloud/src/") || path.startsWith("packages/contracts/src/"),
    ),
  );
});

test("no cloud or contracts file outside the shared shape's file holds a copy of the id shape", () => {
  const readFile = (path) => readFileSync(join(repoRoot, path), "utf8");

  assert.deepEqual(checkFiles(findScannedFiles(repoRoot), readFile, repoRoot), []);
});
