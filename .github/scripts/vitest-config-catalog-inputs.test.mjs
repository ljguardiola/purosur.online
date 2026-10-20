import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  catalogEntryFiles,
  checkRepository,
  findLocalImports,
  findUndeclaredModules,
} from "./vitest-config-catalog-inputs.mjs";

const CONFIG = { path: "vitest.config.ts", namedBy: "the vitest config" };

function withRepository(files, run) {
  const root = mkdtempSync(join(tmpdir(), "vitest-config-catalog-inputs-"));
  try {
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("finds a default, named, renamed, namespace and side-effect import with its line", () => {
  const source = [
    'import config from "./a.mjs";',
    'import { b } from "./b.mjs";',
    'import { c as renamed } from "./c.mjs";',
    'import * as everything from "./d.mjs";',
    'import "./e.mjs";',
  ].join("\n");

  assert.deepEqual(findLocalImports(source, "vitest.config.ts"), [
    { specifier: "./a.mjs", line: 1 },
    { specifier: "./b.mjs", line: 2 },
    { specifier: "./c.mjs", line: 3 },
    { specifier: "./d.mjs", line: 4 },
    { specifier: "./e.mjs", line: 5 },
  ]);
});

test("finds a re-export, a star re-export and a dynamic import with a literal path", () => {
  const source = [
    'export { a } from "./a.mjs";',
    'export * from "./b.mjs";',
    'export * as c from "./c.mjs";',
    "const loaded = await import(",
    '  "./d.mjs");',
  ].join("\n");

  assert.deepEqual(findLocalImports(source, "module.mjs"), [
    { specifier: "./a.mjs", line: 1 },
    { specifier: "./b.mjs", line: 2 },
    { specifier: "./c.mjs", line: 3 },
    { specifier: "./d.mjs", line: 5 },
  ]);
});

test("ignores a package import and a type-only import", () => {
  const source = [
    'import { defineConfig } from "vitest/config";',
    'import { relative } from "node:path";',
    'import type { Options } from "./options.ts";',
    'export type { Shape } from "./shape.ts";',
  ].join("\n");

  assert.deepEqual(findLocalImports(source, "vitest.config.ts"), []);
});

test("accepts a module declared as a catalog input", () => {
  withRepository(
    {
      "vitest.config.ts": 'import { r } from "./.github/scripts/slow-tests-reporter.mjs";\n',
      ".github/scripts/slow-tests-reporter.mjs": "export const r = 1;\n",
    },
    (root) => assert.deepEqual(findUndeclaredModules({ root, entries: [CONFIG] }), []),
  );
});

test("refuses an undeclared module, naming it and the line that imports it", () => {
  withRepository(
    {
      "vitest.config.ts": [
        'import { a } from "vitest";',
        'import { b } from "./tools/b.mjs";',
      ].join("\n"),
      "tools/b.mjs": "export const b = 1;\n",
    },
    (root) =>
      assert.deepEqual(findUndeclaredModules({ root, entries: [CONFIG] }), [
        "tools/b.mjs, imported at vitest.config.ts:2, is not a catalog input in .github/scripts/change-scope.mjs",
      ]),
  );
});

test("refuses an undeclared module reached through a declared one", () => {
  withRepository(
    {
      "vitest.config.ts": 'import { d } from "./.github/scripts/test-durations.mjs";\n',
      ".github/scripts/test-durations.mjs": [
        "export const d = 1;",
        'import { decode } from "./decode.mjs";',
      ].join("\n"),
      ".github/scripts/decode.mjs": "export const decode = 1;\n",
    },
    (root) =>
      assert.deepEqual(findUndeclaredModules({ root, entries: [CONFIG] }), [
        ".github/scripts/decode.mjs, imported at .github/scripts/test-durations.mjs:2, is not a catalog input in .github/scripts/change-scope.mjs",
      ]),
  );
});

test("refuses an undeclared module reached through another undeclared one", () => {
  withRepository(
    {
      "vitest.config.ts": 'import "./tools/a.mjs";\n',
      "tools/a.mjs": 'export * from "../other/b.mjs";\n',
      "other/b.mjs": "export const b = 1;\n",
    },
    (root) =>
      assert.deepEqual(findUndeclaredModules({ root, entries: [CONFIG] }), [
        "tools/a.mjs, imported at vitest.config.ts:1, is not a catalog input in .github/scripts/change-scope.mjs",
        "other/b.mjs, imported at tools/a.mjs:1, is not a catalog input in .github/scripts/change-scope.mjs",
      ]),
  );
});

test("refuses an undeclared module behind a re-export, a namespace import or an alias", () => {
  for (const statement of [
    'export { helper } from "./tools/helper.mjs";',
    'import * as tools from "./tools/helper.mjs";',
    'import { helper as renamed } from "./tools/helper.mjs";',
    'const { helper } = await import("./tools/helper.mjs");',
  ]) {
    withRepository(
      { "vitest.config.ts": statement, "tools/helper.mjs": "export const helper = 1;\n" },
      (root) =>
        assert.deepEqual(
          findUndeclaredModules({ root, entries: [CONFIG] }),
          [
            "tools/helper.mjs, imported at vitest.config.ts:1, is not a catalog input in .github/scripts/change-scope.mjs",
          ],
          statement,
        ),
    );
  }
});

test("resolves a .js specifier to its TypeScript source and an extensionless one to its file", () => {
  withRepository(
    {
      "vitest.config.ts": ['import "./tools/a.js";', 'import "./tools/b";'].join("\n"),
      "tools/a.ts": "export const a = 1;\n",
      "tools/b.ts": "export const b = 1;\n",
    },
    (root) =>
      assert.deepEqual(findUndeclaredModules({ root, entries: [CONFIG] }), [
        "tools/a.ts, imported at vitest.config.ts:1, is not a catalog input in .github/scripts/change-scope.mjs",
        "tools/b.ts, imported at vitest.config.ts:2, is not a catalog input in .github/scripts/change-scope.mjs",
      ]),
  );
});

test("reports a module imported twice once, and follows an import cycle to its end", () => {
  withRepository(
    {
      "vitest.config.ts": ['import "./tools/a.mjs";', 'import "./tools/a.mjs";'].join("\n"),
      "tools/a.mjs": 'import "./b.mjs";\n',
      "tools/b.mjs": 'import "./a.mjs";\n',
    },
    (root) =>
      assert.deepEqual(findUndeclaredModules({ root, entries: [CONFIG] }), [
        "tools/a.mjs, imported at vitest.config.ts:1, is not a catalog input in .github/scripts/change-scope.mjs",
        "tools/b.mjs, imported at tools/a.mjs:1, is not a catalog input in .github/scripts/change-scope.mjs",
      ]),
  );
});

test("refuses an undeclared entry file of the catalog project and follows its imports", () => {
  withRepository(
    {
      "vitest.config.ts": "export default {};\n",
      "setup/global.ts": 'import "./helper.ts";\n',
      "setup/helper.ts": "export {};\n",
    },
    (root) =>
      assert.deepEqual(
        findUndeclaredModules({
          root,
          entries: [CONFIG, { path: "setup/global.ts", namedBy: "a global setup of the catalog" }],
        }),
        [
          "setup/global.ts, a global setup of the catalog, is not a catalog input in .github/scripts/change-scope.mjs",
          "setup/helper.ts, imported at setup/global.ts:1, is not a catalog input in .github/scripts/change-scope.mjs",
        ],
      ),
  );
});

test("refuses an undeclared vitest config", () => {
  withRepository({ "other.config.ts": "export default {};\n" }, (root) =>
    assert.deepEqual(
      findUndeclaredModules({
        root,
        entries: [{ path: "other.config.ts", namedBy: "the vitest config" }],
      }),
      [
        "other.config.ts, the vitest config, is not a catalog input in .github/scripts/change-scope.mjs",
      ],
    ),
  );
});

test("reads the catalog project's global setups and setup files from the config as entry files", () => {
  const config = {
    test: {
      projects: [
        {
          test: {
            name: "node",
            globalSetup: ["/repo/apps/cloud/setup.ts"],
            setupFiles: ["/repo/apps/cloud/each.ts"],
          },
        },
        {
          test: {
            name: "catalog-visual",
            globalSetup: ["/repo/setup/a.ts", "/repo/setup/b.ts"],
            setupFiles: ["/repo/setup/c.ts"],
          },
        },
      ],
    },
  };

  assert.deepEqual(catalogEntryFiles(config, "/repo"), [
    {
      path: "setup/a.ts",
      namedBy: "named by vitest.config.ts as a global setup of the catalog project",
    },
    {
      path: "setup/b.ts",
      namedBy: "named by vitest.config.ts as a global setup of the catalog project",
    },
    {
      path: "setup/c.ts",
      namedBy: "named by vitest.config.ts as a setup file of the catalog project",
    },
  ]);
});

test("reads a catalog project's single entry file named without a list, and a project with none", () => {
  const project = (fields) => ({
    test: { projects: [{ test: { name: "catalog-visual", ...fields } }] },
  });

  assert.deepEqual(
    catalogEntryFiles(
      project({ globalSetup: "/repo/global.ts", setupFiles: "/repo/each.ts" }),
      "/repo",
    ),
    [
      {
        path: "global.ts",
        namedBy: "named by vitest.config.ts as a global setup of the catalog project",
      },
      {
        path: "each.ts",
        namedBy: "named by vitest.config.ts as a setup file of the catalog project",
      },
    ],
  );
  assert.deepEqual(catalogEntryFiles(project({}), "/repo"), []);
});

test("the repository's vitest config reaches no module that is not a catalog input", async () => {
  assert.deepEqual(await checkRepository(), []);
});
