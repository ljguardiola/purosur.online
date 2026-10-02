import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { contractsValueExports, mainAllowedContractsNames } from "./main-contracts-imports.mjs";

const ERROR_REPORT_SCRUBBERS = [
  "scrubErrorReport",
  "scrubErrorReportBreadcrumb",
  "scrubErrorReportLog",
];

function withEntry(t, files) {
  const root = mkdtempSync(join(tmpdir(), "main-contracts-imports-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, name), source);
  }
  return join(root, "index.ts");
}

test("finds the names an entry exports as values, declared there or re-exported", (t) => {
  const entry = withEntry(t, {
    "index.ts": [
      "export const local = 1;",
      "export type LocalType = string;",
      "export interface LocalShape { a: string }",
      'export { value, type ReExportedType } from "./other.js";',
      'export type { ReExportedShape } from "./other.js";',
    ].join("\n"),
    "other.ts": [
      "export const value = 1;",
      "export type ReExportedType = number;",
      "export interface ReExportedShape { b: number }",
    ].join("\n"),
  });

  assert.deepEqual(
    contractsValueExports(entry, [
      "local",
      "LocalType",
      "LocalShape",
      "value",
      "ReExportedType",
      "ReExportedShape",
    ]),
    { values: ["local", "value"], missing: [] },
  );
});

test("finds a type whose name is also exported as a value", (t) => {
  const entry = withEntry(t, {
    "index.ts": "export const Shape = {};\nexport type Shape = typeof Shape;\n",
  });

  assert.deepEqual(contractsValueExports(entry, ["Shape"]), { values: ["Shape"], missing: [] });
});

test("finds a type re-exported as a type whose name the entry also exports as a value", (t) => {
  const entry = withEntry(t, {
    "index.ts": ['export type { Shape } from "./other.js";', "export const Shape = 1;"].join("\n"),
    "other.ts": "export interface Shape { a: string }\n",
  });

  assert.deepEqual(contractsValueExports(entry, ["Shape"]), { values: ["Shape"], missing: [] });
});

test("finds a name the entry doesn't export", (t) => {
  const entry = withEntry(t, { "index.ts": "export type Known = string;\n" });

  assert.deepEqual(contractsValueExports(entry, ["Known", "Unknown"]), {
    values: [],
    missing: ["Unknown"],
  });
});

test("reads the names main's Biome restriction allows from packages/contracts", () => {
  const config = {
    overrides: [
      { includes: ["apps/pos/src/renderer/**"], linter: {} },
      {
        includes: ["apps/pos/src/main/**"],
        linter: {
          rules: {
            style: {
              noRestrictedImports: {
                level: "error",
                options: {
                  paths: {
                    "@purosur/contracts": { message: "m", allowImportNames: ["a", "B"] },
                  },
                },
              },
            },
          },
        },
      },
    ],
  };

  assert.deepEqual(mainAllowedContractsNames(config), ["a", "B"]);
});

test("main may import from packages/contracts only the error report scrubbers as values, and the rest only as types", () => {
  const allowed = mainAllowedContractsNames(JSON.parse(readFileSync("biome.json", "utf8")));
  const typeNames = allowed.filter((name) => !ERROR_REPORT_SCRUBBERS.includes(name));

  assert.deepEqual(
    contractsValueExports("packages/contracts/src/index.ts", [
      ...ERROR_REPORT_SCRUBBERS,
      ...typeNames,
    ]),
    { values: ERROR_REPORT_SCRUBBERS, missing: [] },
  );
});
