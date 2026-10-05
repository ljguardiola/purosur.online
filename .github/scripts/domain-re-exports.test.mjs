import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  checkScreenFiles,
  findDomainValueReExports,
  findScannedFiles,
  findScreenFiles,
  hasDomainReExport,
} from "./domain-re-exports.mjs";

test("finds a domain value that the file exports again", () => {
  const source = [
    'import { LIMIT, isValid } from "@purosur/domain";',
    "export { LIMIT };",
    "export const check = isValid;",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source).toSorted(), ["LIMIT", "isValid"]);
});

test("finds a domain value bound to an exported constant", () => {
  const source = [
    'import { LIMIT } from "@purosur/domain";',
    "export const limit: number =",
    "  LIMIT;",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source), ["LIMIT"]);
});

test("finds a domain value bound to an exported constant with a function type, a cast or a later declarator", () => {
  for (const binding of [
    "export const check: (value: string) => boolean = isValid;",
    "export const check = isValid as (value: string) => boolean;",
    "export const check = isValid satisfies (value: string) => boolean;",
    "export const check = <(value: string) => boolean>isValid;",
    "export const a = 1, check = isValid;",
    "export const check: (value: string, other: number) => boolean = isValid, b = 1;",
  ]) {
    const source = ['import { isValid } from "@purosur/domain";', binding].join("\n");

    assert.deepEqual(findDomainValueReExports(source), ["isValid"], binding);
  }
});

test("finds a domain value bound after a destructuring declarator or under an object type", () => {
  const source = [
    'import { isValid, LIMIT } from "@purosur/domain";',
    "export const { a } = obj, check = isValid;",
    "export const ALIAS: { min: number; max: number } = LIMIT;",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source).toSorted(), ["LIMIT", "isValid"]);
});

test("ignores a domain value bound to a local variable inside an exported function", () => {
  const source = [
    'import { LIMIT } from "@purosur/domain";',
    "export const sum = (xs) => { let total = 0, max = LIMIT; return total + max; };",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source), []);
});

test("ignores an exported constant that builds on a domain value across lines", () => {
  const source = [
    'import { domainValue } from "@purosur/domain";',
    "export const x = domainValue",
    "  .extend({ a: 1 });",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source), []);
});

test("finds a named and a star re-export from domain beside an import from the same specifier", () => {
  const source = [
    'import { isValid } from "@purosur/domain";',
    'export { isEmailAddress, type Order, LIMIT as MAX } from "@purosur/domain";',
    'export * from "@purosur/domain/sales";',
    'export * as access from "@purosur/domain/access";',
    "export const schema = isValid;",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source).toSorted(), [
    "*",
    "LIMIT",
    "access",
    "isEmailAddress",
    "isValid",
  ]);
});

test("ignores a type-only re-export from domain", () => {
  const source = [
    'export type { Order } from "@purosur/domain";',
    'export type * from "@purosur/domain/sales";',
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source), []);
});

test("finds a domain value imported from a domain subpath", () => {
  const source = ['import { LIMIT } from "@purosur/domain/sales";', "export { LIMIT };"].join("\n");

  assert.deepEqual(findDomainValueReExports(source), ["LIMIT"]);
});

test("finds an aliased import and an aliased export of the local name", () => {
  const source = [
    'import { LIMIT as MAX, DIGITS as MIN } from "@purosur/domain";',
    "export { MAX, MIN as minimum };",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source).toSorted(), ["MAX", "MIN"]);
});

test("ignores a type-only import, a type member and a type-only export", () => {
  const source = [
    'import type { Order } from "@purosur/domain";',
    'import { type Item, LIMIT } from "@purosur/domain";',
    "export { type Item };",
    "export type { Order };",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source), []);
});

test("ignores a name imported from another package and a name only used locally", () => {
  const source = [
    'import { z } from "zod";',
    'import { LIMIT } from "@purosur/domain";',
    "export { z };",
    "export const limit = LIMIT + 1;",
    "export const schema = z;",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source), []);
});

test("scans non-test TypeScript files under packages/contracts/src only", () => {
  const root = mkdtempSync(join(tmpdir(), "contracts-re-exports-"));
  try {
    for (const path of [
      "packages/contracts/src/sales/sale.ts",
      "packages/contracts/src/sales/sale.test.ts",
      "packages/domain/src/sales/index.ts",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "");
    }

    assert.deepEqual(findScannedFiles(root), ["packages/contracts/src/sales/sale.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkFiles reports each violation as file#name", () => {
  const files = {
    "packages/contracts/src/a.ts": 'import { X } from "@purosur/domain";\nexport { X };\n',
    "packages/contracts/src/b.ts": "export const y = 1;\n",
  };

  assert.deepEqual(
    checkFiles(Object.keys(files), (path) => files[path]),
    ["packages/contracts/src/a.ts#X"],
  );
});

test("a screen re-export from domain is found, even an empty or type-only one beside a type import", () => {
  for (const reExport of [
    'export {} from "@purosur/domain";',
    'export type { AlertKind as K2 } from "@purosur/domain";',
    'export * from "@purosur/domain/alerts";',
  ]) {
    const source = ['import type { AlertKind } from "@purosur/domain";', reExport].join("\n");

    assert.equal(hasDomainReExport(source), true, reExport);
  }
});

test("a screen that only imports domain types and re-exports elsewhere has no domain re-export", () => {
  const source = [
    'import type { AlertKind } from "@purosur/domain";',
    'export { Button } from "@purosur/ui";',
    "export type Kind = AlertKind;",
  ].join("\n");

  assert.equal(hasDomainReExport(source), false);
});

test("scans non-test TypeScript files of the backoffice and the register's renderer only", () => {
  const root = mkdtempSync(join(tmpdir(), "screen-re-exports-"));
  try {
    for (const path of [
      "apps/backoffice/src/alerts/alert-kind-label.ts",
      "apps/backoffice/src/alerts/alerts-page.tsx",
      "apps/backoffice/src/alerts/alerts-page.test.tsx",
      "apps/pos/src/renderer/shell/app.tsx",
      "apps/pos/src/core/index.ts",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "");
    }

    assert.deepEqual(findScreenFiles(root), [
      "apps/backoffice/src/alerts/alert-kind-label.ts",
      "apps/backoffice/src/alerts/alerts-page.tsx",
      "apps/pos/src/renderer/shell/app.tsx",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkScreenFiles reports each screen file that re-exports from domain", () => {
  const files = {
    "apps/backoffice/src/a.ts": 'export {} from "@purosur/domain";\n',
    "apps/backoffice/src/b.ts": 'import type { X } from "@purosur/domain";\n',
  };

  assert.deepEqual(
    checkScreenFiles(Object.keys(files), (path) => files[path]),
    ["apps/backoffice/src/a.ts"],
  );
});

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "../..");

function repoViolations() {
  return checkFiles(findScannedFiles(repoRoot), (path) =>
    readFileSync(join(repoRoot, path), "utf8"),
  );
}

test("no contracts file re-exports a domain value", () => {
  assert.deepEqual(repoViolations(), []);
});

test("no screen file re-exports from domain", () => {
  assert.deepEqual(
    checkScreenFiles(findScreenFiles(repoRoot), (path) =>
      readFileSync(join(repoRoot, path), "utf8"),
    ),
    [],
  );
});
