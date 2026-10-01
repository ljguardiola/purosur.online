import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  CONTRACTS_LOCAL_DOMAIN_RE_EXPORT_ALLOWLIST,
  checkFiles,
  findDomainValueReExports,
  findScannedFiles,
} from "./contracts-local-domain-re-exports.mjs";

test("finds a domain value that the file exports again", () => {
  const source = [
    'import { LIMIT, isValid } from "@purosur/domain";',
    "export { LIMIT };",
    "export const check = isValid;",
  ].join("\n");

  assert.deepEqual(findDomainValueReExports(source), ["LIMIT"]);
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
    "export const limit = LIMIT;",
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

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "../..");

function repoViolations() {
  return checkFiles(findScannedFiles(repoRoot), (path) =>
    readFileSync(join(repoRoot, path), "utf8"),
  );
}

test("every allowlisted entry is sorted and names an existing file", () => {
  assert.deepEqual(
    CONTRACTS_LOCAL_DOMAIN_RE_EXPORT_ALLOWLIST,
    CONTRACTS_LOCAL_DOMAIN_RE_EXPORT_ALLOWLIST.toSorted(),
  );
  for (const entry of CONTRACTS_LOCAL_DOMAIN_RE_EXPORT_ALLOWLIST) {
    statSync(join(repoRoot, entry.split("#")[0]));
  }
});

test("the allowlist is exactly the contracts files that re-export a domain value today", () => {
  assert.deepEqual(repoViolations().toSorted(), CONTRACTS_LOCAL_DOMAIN_RE_EXPORT_ALLOWLIST);
});
