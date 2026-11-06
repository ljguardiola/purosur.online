import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  findInheritedKeyLookups,
  isCheckedFile,
  KEY_LOOKUP_PROGRAMS,
} from "./own-entry-key-lookups.mjs";
import { projectWith } from "./test-support/own-entry-key-lookups.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const FILE = "packages/a/src/table.ts";
const IN = "tests a key from outside the code with `in`";
const CAST = "casts a key to `keyof`";
const INDEX = "indexes a table with a string index by a key from outside the code";

function lookupsIn(t, files, trackedFiles = Object.keys(files)) {
  const project = typeof files === "string" ? { [FILE]: files } : files;
  return findInheritedKeyLookups(projectWith(t, project), {
    tsconfigs: ["tsconfig.json"],
    trackedFiles: typeof files === "string" ? [FILE] : trackedFiles,
  });
}

function source(...lines) {
  return lines.join("\n");
}

test("refuses `in` with a key that is not a literal, naming the file and line", (t) => {
  const lookups = lookupsIn(
    t,
    source("const TABLE = { a: 1 };", "export const has = (key: string) => key in TABLE;"),
  );

  assert.deepEqual(lookups, [`${FILE}:2: ${IN}`]);
});

test("accepts `in` with a literal key, a key limited to known names, a number or a private name", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "type Shape = { kind: 'a' } | { size: number };",
      "export const isA = (shape: Shape) => 'kind' in shape;",
      "export const hasKnown = (shape: Shape, name: 'kind' | 'size') => name in shape;",
      "export const hasIndex = (list: string[], index: number) => index in list;",
      "export class Box { #secret = 1; static holds(value: object) { return #secret in value; } }",
    ),
  );

  assert.deepEqual(lookups, []);
});

test("refuses a cast to `keyof typeof`, to `keyof` a type and to an alias of either", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "const TABLE = { a: 1 };",
      "type Table = typeof TABLE;",
      "type TableKey = keyof typeof TABLE;",
      "type OtherKey = TableKey;",
      "export const a = (key: string) => key as keyof typeof TABLE;",
      "export const b = (key: string) => key as keyof Table;",
      "export const c = (key: string) => key as TableKey;",
      "export const d = (key: string) => key as OtherKey;",
    ),
  );

  assert.deepEqual(lookups, [
    `${FILE}:5: ${CAST}`,
    `${FILE}:6: ${CAST}`,
    `${FILE}:7: ${CAST}`,
    `${FILE}:8: ${CAST}`,
  ]);
});

test("refuses a cast to `keyof` written as an angle-bracket assertion", (t) => {
  const lookups = lookupsIn(
    t,
    source("const TABLE = { a: 1 };", "export const a = (key: string) => <keyof typeof TABLE>key;"),
  );

  assert.deepEqual(lookups, [`${FILE}:2: ${CAST}`]);
});

test("refuses reading a table typed `Record<string, …>` with a key from outside the code", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "const TABLE: Record<string, number> = { a: 1 };",
      "export const read = (key: string) => TABLE[key];",
    ),
  );

  assert.deepEqual(lookups, [`${FILE}:2: ${INDEX}`]);
});

test("refuses a table with a string index signature, whether written, aliased, imported, inferred or cast", (t) => {
  const lookups = lookupsIn(t, {
    "packages/a/src/types.ts": "export type Tokens = { [name: string]: string };",
    [FILE]: source(
      'import type { Tokens } from "./types";',
      "type Drafts = Record<string, number>;",
      "export const a = (t: { [name: string]: number }, key: string) => t[key];",
      "export const b = (t: Drafts, key: string) => t[key];",
      "export const c = (t: Tokens, key: string) => t[key];",
      "export const d = (pairs: [string, number][], key: string) => Object.fromEntries(pairs)[key];",
      "export const e = (value: object, key: string) => (value as Record<string, unknown>)[key];",
      `export const f = (t: Record<\`\${string}_NAME\`, string>, key: \`\${string}_NAME\`) => t[key];`,
    ),
  });

  assert.deepEqual(lookups, [
    `${FILE}:3: ${INDEX}`,
    `${FILE}:4: ${INDEX}`,
    `${FILE}:5: ${INDEX}`,
    `${FILE}:6: ${INDEX}`,
    `${FILE}:7: ${INDEX}`,
    `${FILE}:8: ${INDEX}`,
  ]);
});

test("refuses writing, deleting, reading optionally and destructuring a key from outside the code", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "export function copy(entries: [string, number][]) {",
      "  const result: Record<string, number> = {};",
      "  for (const [key, value] of entries) result[key] = value;",
      "  for (const [key] of entries) delete result[key];",
      "  return result;",
      "}",
      "export const read = (t: Record<string, number> | undefined, key: string) => t?.[key];",
      "export function pick(t: Record<string, number>, key: string) {",
      "  const { [key]: value } = t;",
      "  return value;",
      "}",
    ),
  );

  assert.deepEqual(lookups, [
    `${FILE}:3: ${INDEX}`,
    `${FILE}:4: ${INDEX}`,
    `${FILE}:7: ${INDEX}`,
    `${FILE}:9: ${INDEX}`,
  ]);
});

test("refuses a key whose generic type allows any string", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "export const read = <Name extends string>(t: Record<string, number>, name: Name) => t[name];",
    ),
  );

  assert.deepEqual(lookups, [`${FILE}:1: ${INDEX}`]);
});

test("accepts a key limited to known names, a literal key, a number, a symbol and an array index", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "type Name = 'a' | 'b';",
      "const TABLE: Record<string, number> = { a: 1 };",
      "export const a = (key: Name) => TABLE[key];",
      "export const b = () => TABLE['a'];",
      "export const c = <K extends Name>(key: K) => TABLE[key];",
      `export const d = (op: "Get" | "Set") => TABLE[\`\${op}Result\`];`,
      "export const e = (t: Record<number, string>, index: number) => t[index];",
      "export const f = (t: { [key: string]: unknown; [Symbol.iterator]: unknown }) => t[Symbol.iterator];",
      "export const g = (list: string[], index: number) => list[index];",
    ),
  );

  assert.deepEqual(lookups, []);
});

test("accepts a `Map`", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "const TABLE = new Map<string, number>([['a', 1]]);",
      "export const read = (key: string) => TABLE.get(key);",
      "export const has = (key: string) => TABLE.has(key);",
    ),
  );

  assert.deepEqual(lookups, []);
});

test("accepts a lookup that `Object.hasOwn` guards in a condition, an `if` or an early exit", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "const TABLE: Record<string, number> = { a: 1 };",
      "export const a = (key: string) => (Object.hasOwn(TABLE, key) ? TABLE[key] : undefined);",
      "export const b = (key: string) => Object.hasOwn(TABLE, key) && TABLE[key];",
      "export function c(key: string) {",
      "  if (Object.hasOwn(TABLE, key)) {",
      "    return TABLE[key];",
      "  }",
      "  return undefined;",
      "}",
      "export function d(key: string) {",
      "  if (!Object.hasOwn(TABLE, key)) return undefined;",
      "  return TABLE[key];",
      "}",
      "export function e(key: string) {",
      "  if (!Object.hasOwn(TABLE, key)) {",
      "    throw new Error(key);",
      "  }",
      "  return TABLE[key];",
      "}",
    ),
  );

  assert.deepEqual(lookups, []);
});

test("refuses a lookup that `Object.hasOwn` guards for another key, another table, or only in the other branch", (t) => {
  const lookups = lookupsIn(
    t,
    source(
      "const TABLE: Record<string, number> = { a: 1 };",
      "const OTHER: Record<string, number> = { a: 1 };",
      "export const a = (key: string, name: string) => (Object.hasOwn(TABLE, name) ? TABLE[key] : 0);",
      "export const b = (key: string) => (Object.hasOwn(OTHER, key) ? TABLE[key] : 0);",
      "export const c = (key: string) => (Object.hasOwn(TABLE, key) ? 0 : TABLE[key]);",
      "export function d(key: string) {",
      "  if (!Object.hasOwn(TABLE, key)) console.log(key);",
      "  return TABLE[key];",
      "}",
    ),
  );

  assert.deepEqual(lookups, [
    `${FILE}:3: ${INDEX}`,
    `${FILE}:4: ${INDEX}`,
    `${FILE}:5: ${INDEX}`,
    `${FILE}:8: ${INDEX}`,
  ]);
});

test("checks a tracked source file that no program includes", (t) => {
  const lookups = lookupsIn(
    t,
    {
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true }, include: ["apps"] }),
      "packages/a/.config/main.ts": "export const has = (key: string) => key in {};",
    },
    ["packages/a/.config/main.ts"],
  );

  assert.deepEqual(lookups, [`packages/a/.config/main.ts:1: ${IN}`]);
});

test("checks the source files of apps and packages, never their tests or files outside them", () => {
  for (const path of [
    "apps/cloud/src/server.ts",
    "apps/pos/src/renderer/main.tsx",
    "packages/ui/src/components/forms/button.stories.tsx",
    "packages/ui/.storybook/main.ts",
    "apps/cloud/vitest.global-setup.ts",
  ]) {
    assert.equal(isCheckedFile(path), true, path);
  }
  for (const path of [
    "apps/cloud/src/server.test.ts",
    "packages/ui/src/catalog-screenshots.visual.tsx",
    "packages/domain/src/sales/use-cases/test-support/fakes.ts",
    "packages/ui/src/test/axe.ts",
    "apps/pos/e2e/launch-app.ts",
    "packages/domain/src/types.d.ts",
    ".railway/railway.ts",
    "vitest.config.ts",
  ]) {
    assert.equal(isCheckedFile(path), false, path);
  }
});

test("every source file of apps and packages looks a key from outside the code up only as an own entry", () => {
  assert.deepEqual(
    findInheritedKeyLookups(repoRoot, { tsconfigs: KEY_LOOKUP_PROGRAMS }),
    [],
    "look the key up in a Map, guard it with Object.hasOwn, or build the result with Object.fromEntries",
  );
});
