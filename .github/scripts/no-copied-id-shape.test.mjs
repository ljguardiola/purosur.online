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
  ['import { z } from "zod";\nconst id = z.string().check(z.core.regexes.guid);', [2]],
  ['import { z } from "zod";\nconst id = z["uuid"]();', [2]],
  ['import { z } from "zod";\nconst id = new z.ZodGUID({ type: "string" });', [2]],
  ['import * as z from "zod/v4";\nconst id = z.guid();', [2]],
  ['import { z } from "zod/mini";\nconst id = z.uuid();', [2]],
  ['import zod from "zod";\nconst id = zod.guid();', [2]],
  ['import { guid as anyId } from "zod";\nconst id = anyId();', [1, 2]],
  ['import { regexes } from "zod/v4/core";\nconst id = regexes.uuid4;', [2]],
  ['import { z } from "zod";\nconst text = z.string();\nconst id = text.uuid();', [3]],
  ['import { z } from "zod";\nconst { guid } = z;\nconst id = guid();', [2, 3]],
  ['import { z } from "zod";\nconst { "uuid": anyId } = z;', [2]],
  [
    'import { z } from "zod";\nconst text = () => z.string();\nexport const id = text().guid();',
    [3],
  ],
  ['const { z } = await import("zod");\nexport const id = z.guid();', [2]],
  ['export const id = (await import("zod")).z.guid();', [1]],
  ['export { guid } from "zod";', [1]],
  ['export { uuid as anyId } from "zod/v4";', [1]],
  ['export type { ZodGUID } from "zod";', [1]],
];

test("finds a zod uuid or guid format where it is taken from zod, however it is reached", () => {
  for (const [source, lines] of ZOD_ID_FORMATS) {
    assert.deepEqual(linesOf(source), lines, source);
  }
});

test("finds a zod id format picked by a computed key, whatever spells the key", () => {
  for (const [source, lines] of [
    ['import { z } from "zod";\nconst id = z[`uuid`]();', [2]],
    ['import { z } from "zod";\nconst key = "uuid";\nconst id = z[key]();', [3]],
    ['import { z } from "zod";\nconst id = z["guid" as const]();', [2]],
    ['import { z } from "zod";\nconst id = z.string()[("gu" + "id") as "guid"]();', [2]],
    [
      'import { z } from "zod";\ndeclare const key: keyof typeof z;\nexport const format = z[key];',
      [3],
    ],
    ['import { z } from "zod";\nconst { ["uuid"]: anyId } = z;\nanyId();', [2, 3]],
    ['import { z } from "zod";\nconst key = "guid";\nconst { [key]: anyId } = z.string();', [3]],
  ]) {
    assert.deepEqual(linesOf(source), lines, source);
  }
});

test("finds a zod id format taken by destructuring, in any position and at any depth", () => {
  const zodAnd = (...lines) => ['import { z } from "zod";', ...lines].join("\n");
  for (const [source, lines] of [
    [zodAnd("let f: () => z.ZodType;", "({ uuid: f } = z);"), [3]],
    [zodAnd("let f: () => z.ZodType;", '({ ["uuid"]: f } = z);'), [3]],
    [zodAnd('const key = "uuid";', "let f: () => z.ZodType;", "({ [key]: f } = z);"), [4]],
    [zodAnd("let guid: () => z.ZodType;", "({ guid } = z);"), [3]],
    [zodAnd("let guid: () => z.ZodType;", "({ guid = z.string } = z);"), [3]],
    [zodAnd("let f: () => z.ZodType;", "({ a: { uuid: f } } = { a: z });"), [3]],
    [zodAnd("let f: () => z.ZodType;", "[{ guid: f }] = [z];"), [3]],
    [zodAnd("let guid: () => z.ZodType;", "for ({ guid } of [z]) guid();"), [3]],
    [zodAnd("let guid: () => z.ZodType;", "for ({ guid } of new Set([z])) guid();"), [3]],
    [zodAnd("let f: () => z.ZodType;", 'for ({ ["uuid"]: f } of new Set([z]));'), [3]],
    [
      zodAnd(
        "function* formats() {",
        "  yield z;",
        "}",
        "let f: () => z.ZodType;",
        "for ({ guid: f } of formats());",
      ),
      [6],
    ],
    [zodAnd("let f: () => z.ZodType;", "({ a: { guid: f } = {} } = { a: z });"), [3]],
    [zodAnd("let f: () => z.ZodType;", "[{ guid: f } = {}] = [z];"), [3]],
    [zodAnd("let f: () => z.ZodType;", "[{ guid: f } = {}] = new Set([z]);"), [3]],
    [
      zodAnd(
        "function* formats() {",
        "  yield z;",
        "}",
        "let f: () => z.ZodType;",
        "[{ uuid: f } = {}] = formats();",
      ),
      [6],
    ],
    [zodAnd("let f: unknown;", "const pair: [typeof z] = [z];", "[...[{ uuid: f }]] = pair;"), [4]],
    [
      zodAnd("let f: unknown;", "const pair: [typeof z] = [z];", "[...{ 0: { guid: f } }] = pair;"),
      [4],
    ],
    [zodAnd("let f: unknown;", "[, ...[{ uuid: f }]] = [1, z];"), [3]],
    [zodAnd("let f: unknown;", "[...[...[{ guid: f }]]] = [z];"), [3]],
    [zodAnd("for (const { guid } of [z]) guid();"), [2]],
    [zodAnd("const { a: { uuid: f } } = { a: z };"), [2]],
    [zodAnd("const [{ guid }] = [z];"), [2]],
    [zodAnd("export function f({ uuid }: typeof z) {", "  return uuid();", "}"), [2, 3]],
    [zodAnd("export const f = ({ a: { guid } }: { a: typeof z }) => guid();"), [2]],
  ]) {
    assert.deepEqual(linesOf(source), lines, source);
  }
});

test("ignores destructuring that takes no zod id format", () => {
  const source = [
    'import { z } from "zod";',
    "const row = { uuid: 1, guid: 2 };",
    'const key = "uuid";',
    "let a: number;",
    "let uuid: number;",
    "let text: () => z.ZodString;",
    "({ uuid: a, guid: a } = row);",
    '({ ["uuid"]: a } = row);',
    "({ [key]: a } = row);",
    "({ uuid } = row);",
    "({ a: { guid: a } } = { a: row });",
    "[{ uuid: a }] = [row];",
    "for ({ uuid } of [row]);",
    "for (const { guid } of [row]) a = guid;",
    "export function f({ uuid }: typeof row) {",
    "  return uuid;",
    "}",
    "[...[{ uuid: a }]] = [row];",
    "[...{ 0: { guid: a } }] = [row];",
    "[, ...[{ guid: a }]] = [z, row];",
    "({ string: text } = z);",
    "const { object } = z;",
    "export const shape = object({});",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("finds a zod value or schema given to a type the file declares in place of zod's id format", () => {
  const zodAnd = (...lines) => ['import { z } from "zod";', ...lines].join("\n");
  for (const [source, lines] of [
    [zodAnd("const formats: { uuid(): z.ZodType } = z;", "formats.uuid();"), [2]],
    [zodAnd("const text: { guid(): z.ZodType } = z.string();", "text.guid();"), [2]],
    [
      zodAnd(
        "function pick<T extends { uuid(): unknown }>(o: T) {",
        "  return o.uuid();",
        "}",
        "pick(z);",
      ),
      [5],
    ],
    [zodAnd("function use(f: { guid(): unknown }) {", "  return f;", "}", "use(z.string());"), [5]],
    [zodAnd("export function formats(): { uuid(): unknown } {", "  return z;", "}"), [3]],
    [zodAnd("let formats: { guid(): unknown } | undefined;", "formats = z;"), [3]],
    [zodAnd("export const holder: { a: { uuid(): unknown } } = {", "  a: z,", "};"), [3]],
    [zodAnd("export const formats = z satisfies { guid(): unknown };"), [2]],
    [zodAnd("const a = z;", "export const holder: { a: { uuid(): unknown } } = { a };"), [3]],
    [
      zodAnd(
        "const holder = { a: { b: z.string() } };",
        "export const upcast: { a: { b: { guid(): unknown } } } = holder;",
      ),
      [3],
    ],
    [
      zodAnd(
        "const holder = { a: { b: { c: { d: z } } } };",
        "export const upcast: { a: { b: { c: { d: { uuid(): unknown } } } } } = holder;",
      ),
      [3],
    ],
    [
      zodAnd(
        "const holder = { a: { b: { c: { d: { e: z.string() } } } } };",
        "export const upcast: { a: { b: { c: { d: { e: { guid(): unknown } } } } } } = holder;",
      ),
      [3],
    ],
    [zodAnd("const all = [z];", "export const upcast: { uuid(): unknown }[] = all;"), [3]],
    [
      zodAnd(
        "const holder = { a: z };",
        'export const upcast: Record<"a", { uuid(): unknown }> = holder;',
      ),
      [3],
    ],
    [
      zodAnd("const make = () => z;", "export const upcast: () => { guid(): unknown } = make;"),
      [3],
    ],
    [
      zodAnd(
        "function pick<T extends { a: { uuid(): unknown } }>(o: T) {",
        "  return o;",
        "}",
        "pick({ a: z });",
      ),
      [5],
    ],
    [zodAnd("const take = (o: { uuid(): unknown }) => o;", "[z].map(take);"), [3]],
    [zodAnd("[z.string()].map((o: { guid(): unknown }) => o);"), [2]],
    [
      zodAnd("export const take: (formats: typeof z) => void = (o: { uuid(): unknown }) => o;"),
      [2],
    ],
  ]) {
    assert.deepEqual(linesOf(source), lines, source);
  }
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
    "type Row = { uuid: string };",
    'export const row: Row = { uuid: "" };',
    "function store(entry: { guid: number }) {",
    "  return entry;",
    "}",
    "store({ guid: 1 });",
    "const rows = { a: { guid: 1 } };",
    "export const nested: { a: { guid: number } } = rows;",
    "type Tree = { uuid: string; children: Tree[] };",
    'const tree = { uuid: "", children: [] as Tree[] };',
    "export const root: Tree = tree;",
    "export const schemas: { a: { b: z.ZodString } } = { a: { b: recordIdSchema() } };",
    "export const texts = [z.string()].map((text: z.ZodString) => text.min(1));",
    "export const guids = [row].map((entry: { uuid: string }) => entry.uuid);",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("finds a call of a zod id format on the line it is called, however the format was passed on", () => {
  const zodAnd = (...lines) => ['import { z } from "zod";', ...lines].join("\n");
  for (const [source, lines] of [
    [
      zodAnd(
        "declare const cond: boolean;",
        "const g = cond ? z.guid : z.uuid;",
        "export const id = g();",
      ),
      [3, 4],
    ],
    [zodAnd("const pick = () => z.uuid;", "export const id = pick()();"), [2, 3]],
    [zodAnd("export function make(f: typeof z.uuid) {", "  return f();", "}"), [2, 3]],
    [
      zodAnd(
        "const make = (text: z.ZodString) => text.guid;",
        "export const id = make(z.string())();",
      ),
      [2, 3],
    ],
  ]) {
    assert.deepEqual(linesOf(source), lines, source);
  }
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

test("finds a zod id format named by an indexed access type", () => {
  const zodAnd = (...lines) => ['import { z } from "zod";', ...lines].join("\n");
  for (const [source, lines] of [
    [zodAnd('export type F = z.ZodString["uuid"];'), [2]],
    [zodAnd('type Key = "uuid" | "string";', "export type F = (typeof z)[Key];"), [3]],
    [zodAnd('export function make(f: z.ZodString["guid"]) {', "  return f;", "}"), [2]],
  ]) {
    assert.deepEqual(linesOf(source), lines, source);
  }
});

test("ignores indexed access types that name no zod id format", () => {
  const source = [
    'import { z } from "zod";',
    "const row = { uuid: 1, guid: 2 };",
    'export type Row = (typeof row)["uuid"];',
    'export type Plain = { guid: string }["guid"];',
    'export type Min = z.ZodString["min"];',
    'export type Formats = (typeof z)["string" | "object"];',
    "const owner = z.object({ ownerUuid: z.string() });",
    'export type Owner = z.infer<typeof owner>["ownerUuid"];',
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

test("finds any name of zod that spells uuid or guid, whatever else it holds", () => {
  for (const [source, lines] of [
    ['import { _guid } from "zod/v4/core";\nconst id = _guid;', [1, 2]],
    ['import { z } from "zod";\nconst id = z.core._uuid;', [2]],
    ['import { ZodMiniUUID } from "zod/mini";', [1]],
    ['import type { $ZodUUIDDef } from "zod/v4/core";', [1]],
    ['import * as core from "zod/v4/core";\ntype Params = core.$ZodCheckUUIDParams;', [2]],
    ['import { z } from "zod";\nconst { _uuidv7 } = z.core;', [2]],
    ['import { z } from "zod";\nconst ids = z.core;\nconst id = ids._guid;', [3]],
  ]) {
    assert.deepEqual(linesOf(source), lines, source);
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

test("ignores names that spell uuid or guid when they are not declared by zod", () => {
  const source = [
    'import { uuid } from "drizzle-orm/pg-core";',
    'import { z } from "zod";',
    "const owner = z.object({ ownerUuid: z.string(), guidance: z.string() });",
    "export const field = owner.shape.ownerUuid;",
    'export const other = owner.shape["guidance"];',
    "export const { ownerUuid } = owner.shape;",
    'export const id = uuid("id").primaryKey().defaultRandom();',
    "export const generated = crypto.randomUUID();",
    "const row = { uuid: 1, guid: 2 };",
    "export const stored = row.uuid ?? row.guid;",
    'const key = "uuid";',
    "export const picked = row[key];",
    "export const { [key]: destructured } = row;",
    "declare const field: keyof typeof row;",
    "export const any = row[field];",
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
