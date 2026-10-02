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
  ['import { z } from "zod";\nconst id = z.uuid();', 2],
  ['import { z } from "zod";\nconst id = z.guid({ error: "id must be an id" });', 2],
  ['import { z } from "zod";\nconst id = z.string().uuid();', 2],
  ['import { z } from "zod";\nconst id = z.string().min(1).guid();', 2],
  ['import { z } from "zod";\nconst id = z.uuidv4();', 2],
  ['import { z } from "zod";\nconst id = z.uuidv7();', 2],
  ['import { z } from "zod";\nconst id = z.string().regex(z.regexes.uuid());', 2],
  ['import { z } from "zod";\nconst id = z.string().check(z.core.regexes.guid);', 2],
  ['import { z } from "zod";\nconst id = z["uuid"]();', 2],
  ['import { z } from "zod";\nconst id = new z.ZodGUID({ type: "string" });', 2],
  ['import * as z from "zod/v4";\nconst id = z.guid();', 2],
  ['import z from "zod/mini";\nconst id = z.uuid();', 2],
  ['import { guid as anyId } from "zod";\nconst id = anyId();', 1],
  ['import { regexes } from "zod/v4/core";\nconst id = regexes.uuid4;', 2],
  ['import { z } from "zod";\nconst text = z.string();\nconst id = text.uuid();', 3],
  ['import { z } from "zod";\nconst { guid } = z;\nconst id = guid();', 2],
];

test("finds a zod uuid or guid format where it is taken from zod, however it is reached", () => {
  for (const [source, line] of ZOD_ID_FORMATS) {
    assert.deepEqual(linesOf(source), [line], source);
  }
});

test("finds every re-export from zod, through which another file could reach an id format", () => {
  for (const [source, line] of [
    ['export { guid } from "zod";', 1],
    ['export { z } from "zod";', 1],
    ['export { string } from "zod/v4";', 1],
    ['export { uuid as anyId } from "zod/v4";', 1],
    ['export type { ZodGUID } from "zod";', 1],
    ['export type { ZodType } from "zod";', 1],
    ['export * from "zod";', 1],
    ['export * as zod from "zod/mini";', 1],
  ]) {
    assert.deepEqual(linesOf(source), [line], source);
  }
});

test("finds an export of a binding that is zod itself or a part of it taken without a call", () => {
  for (const [source, line] of [
    ['import { z } from "zod";\nexport { z };', 2],
    ['import { z } from "zod";\nexport { z as zod };', 2],
    ['import * as z from "zod";\nexport default z;', 2],
    ['import z from "zod/mini";\nexport = z;', 2],
    ['import { string } from "zod";\nexport { string };', 2],
    ['import type { ZodType } from "zod";\nexport type { ZodType };', 2],
    ['import { z } from "zod";\nexport const zz = z;', 2],
    ['import { z } from "zod";\nexport const zz = (z as typeof z);', 2],
    ['import { z } from "zod";\nexport const g = z.guid;', 2],
    ['import { z } from "zod";\nexport const r = z["regexes"];', 2],
    ['import { z } from "zod";\nexport const { string } = z;', 2],
    ['import { z } from "zod";\nconst zz = z;\nexport { zz };', 3],
    ['import { z } from "zod";\nconst zz = z;\nexport default zz;', 3],
    ['import { z } from "zod";\nconst zz = z;\nexport const zzz = zz;', 3],
    ['import { z } from "zod";\nconst { object } = z;\nexport { object };', 3],
  ]) {
    assert.deepEqual(linesOf(source), [line], source);
  }
});

test("ignores exported schemas built with zod and re-exports that do not come from zod", () => {
  const source = [
    'import { z } from "zod";',
    'export { uuid } from "drizzle-orm/pg-core";',
    'export * from "./shared/index.js";',
    'export { recordIdSchema } from "./record-id.js";',
    "export const nameSchema = z.string().min(1);",
    "const priceSchema = z.object({ cents: z.number().int() });",
    "export { priceSchema };",
    "export default priceSchema;",
    "export type Price = z.infer<typeof priceSchema>;",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("finds zod or a part of it used as a value, which carries it where the check cannot follow", () => {
  for (const [source, line] of [
    ['import { z } from "zod";\nexport const schemas = { z };', 2],
    ['import { z } from "zod";\nexport const schemas = { zod: z };', 2],
    ['import { z } from "zod";\nexport function zod() {\n  return z;\n}', 3],
    ['import { z } from "zod";\nregister(z);', 2],
    ['import { z } from "zod";\nexport const all = [z];', 2],
    ['import { z } from "zod";\nexport const zod = () => z;', 2],
    ['import * as zod from "zod/v4";\nexport const tools = { zod };', 2],
    ['import { z } from "zod";\nexport const zod = () => (z as typeof z);', 2],
    ['import { z } from "zod";\nconst zz = z;\nregister(zz);', 3],
    ['import { z } from "zod";\nconst { core } = z;\nexport const tools = { core };', 3],
  ]) {
    assert.deepEqual(linesOf(source), [line], source);
  }
});

test("finds a part of zod that holds the id formats used as a value", () => {
  for (const [source, line] of [
    ['import * as zod from "zod/v4";\nexport const tools = { patterns: zod.regexes };', 2],
    ['import { z } from "zod";\nregister(z.core);', 2],
    ['import { z } from "zod";\nregister(z.guid);', 2],
    ['import * as zod from "zod";\nregister(zod.z);', 2],
    ['import * as zod from "zod";\nexport const all = [zod.default];', 2],
    ['import { z } from "zod";\nexport const zod = () => z.core.regexes;', 2],
    ['import { z } from "zod";\nregister((z as typeof z).regexes!);', 2],
    ['import { z } from "zod";\nregister(z["core"]);', 2],
  ]) {
    assert.deepEqual(linesOf(source), [line], source);
  }
});

test("ignores zod reached only by accessing or calling it, or named in a type", () => {
  const source = [
    'import { z } from "zod";',
    'import type { ZodType } from "zod";',
    "export const s = z.object({ id: z.string() });",
    "export const listed = z.array(s).min(1);",
    "export type S = z.infer<typeof s>;",
    "let zodType: typeof z;",
    "export const parse = (schema: ZodType, input: unknown) => schema.parse(input);",
    "register(z.string().min(1));",
    "const refuse = () => z.NEVER;",
    "register(z.string, z.iso, z.coerce, z.locales);",
    "const zod = { z: 1 };",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("finds any name of zod that spells uuid or guid, whatever else it holds", () => {
  for (const [source, line] of [
    ['import { _guid } from "zod/v4/core";\nconst id = _guid();', 1],
    ['import { z } from "zod";\nconst id = z.core._uuid({});', 2],
    ['import { ZodMiniUUID } from "zod/mini";', 1],
    ['import type { $ZodUUIDDef } from "zod/v4/core";', 1],
    ['import * as core from "zod/v4/core";\nconst params = core.$ZodCheckUUIDParams;', 2],
    ['import { z } from "zod";\nconst { _uuidv7 } = z.core;', 2],
    ['import { z } from "zod";\nconst ids = z.core;\nconst id = ids._guid({});', 3],
  ]) {
    assert.deepEqual(linesOf(source), [line], source);
  }
});

test("finds a member of zod picked by a key that is not written out", () => {
  for (const [source, line] of [
    ['import { z } from "zod";\nconst id = z[key]();', 2],
    ['import { z } from "zod";\nregister(z[key]);', 2],
    ['import { z } from "zod";\nconst check = z.core[name];', 2],
    ['import * as zod from "zod";\nconst check = (zod as typeof zod).regexes![name];', 2],
  ]) {
    assert.deepEqual(linesOf(source), [line], source);
  }
});

test("ignores names that spell uuid or guid and keys not written out when they are not taken from zod", () => {
  const source = [
    'import { z } from "zod";',
    'import { uuidColumn } from "./columns";',
    "const owner = z.object({ ownerUuid: z.string(), guidance: z.string() });",
    "const field = owner.shape.ownerUuid;",
    "const text = parsed.guidance;",
    "const value = owner.shape[key];",
    "const row = record[key];",
    "const column = uuidColumn();",
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

test("ignores uuid and guid names that do not come from zod", () => {
  const source = [
    'import { uuid } from "drizzle-orm/pg-core";',
    'import { z } from "zod";',
    'const id = uuid("id").primaryKey().defaultRandom();',
    "const generated = crypto.randomUUID();",
    "const stored = row.uuid ?? row.guid;",
    "const text = z.string().min(1);",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("recognizes the shared shape's own file as the shape", () => {
  const source = readFileSync(join(repoRoot, ID_SHAPE_PATH), "utf8");

  assert.notDeepEqual(findIdShapeCopies(source, ID_SHAPE_PATH), []);
});

test("reports each file and line holding a copy", () => {
  const files = {
    "apps/cloud/src/a.test.ts": `x();\nconst ID = ${PLATFORM_PATTERN};`,
    "packages/contracts/src/b.ts": 'import { z } from "zod";\nconst id = z.guid();',
    "apps/cloud/src/c.ts": "z();",
  };

  assert.deepEqual(
    checkFiles(Object.keys(files), (path) => files[path]),
    [
      `apps/cloud/src/a.test.ts:2 holds a copy of the record id shape, which lives only in ${ID_SHAPE_PATH}`,
      `packages/contracts/src/b.ts:2 holds a copy of the record id shape, which lives only in ${ID_SHAPE_PATH}`,
    ],
  );
});

test("scans every cloud and contracts source file, tests included, except the shared shape's file", () => {
  const scanned = findScannedFiles(repoRoot);

  assert.ok(scanned.includes("apps/cloud/src/catalog/drizzle-catalog-store.ts"));
  assert.ok(scanned.includes("apps/cloud/src/catalog/drizzle-catalog-store.test.ts"));
  assert.ok(scanned.includes("packages/contracts/src/shared/index.ts"));
  assert.ok(scanned.includes("packages/contracts/src/shared/record-id.test.ts"));
  assert.ok(
    scanned.every(
      (path) => path.startsWith("apps/cloud/src/") || path.startsWith("packages/contracts/src/"),
    ),
  );
  assert.ok(!scanned.includes(ID_SHAPE_PATH));
});

test("no cloud or contracts file outside the shared shape's file holds a copy of the id shape", () => {
  const readFile = (path) => readFileSync(join(repoRoot, path), "utf8");

  assert.deepEqual(checkFiles(findScannedFiles(repoRoot), readFile), []);
});
