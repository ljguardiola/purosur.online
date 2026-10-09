import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  describeUnresolvedSubpath,
  findSubpathsNotResolvingToSource,
  findWorkspaceSubpathImports,
} from "./workspace-subpaths-resolve-to-source.mjs";

function writeFile(root, path, contents) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}

function writeJson(root, path, value) {
  writeFile(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function createWorkspace({ compilerOptions = {}, exports, files = [] }) {
  const root = mkdtempSync(join(tmpdir(), "workspace-subpaths-resolve-to-source-"));
  writeFile(root, "pnpm-workspace.yaml", "packages:\n  - packages/*\n  - apps/*\n");
  writeJson(root, "tsconfig.json", {
    compilerOptions: {
      module: "ESNext",
      moduleResolution: "Bundler",
      noEmit: true,
      ...compilerOptions,
    },
  });
  writeJson(root, "packages/library/package.json", {
    name: "@example/library",
    type: "module",
    main: "./dist/index.js",
    exports,
  });
  writeFile(root, "packages/library/src/index.ts", "export const root = 1;\n");
  writeFile(root, "packages/library/src/orders/index.ts", "export const orders = 1;\n");
  for (const path of files) writeFile(root, path, "export declare const built: 1;\n");
  writeJson(root, "apps/shop/package.json", {
    name: "@example/shop",
    dependencies: { "@example/library": "workspace:*" },
  });
  writeFile(root, "apps/shop/src/index.ts", "");
  mkdirSync(join(root, "apps/shop/node_modules/@example"), { recursive: true });
  symlinkSync(
    "../../../../packages/library",
    join(root, "apps/shop/node_modules/@example/library"),
  );
  return root;
}

function withWorkspace(options, run) {
  const root = createWorkspace(options);
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const builtExports = {
  ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
  "./orders": { types: "./dist/orders/index.d.ts", default: "./dist/orders/index.js" },
};

const builtFiles = ["packages/library/dist/index.d.ts", "packages/library/dist/orders/index.d.ts"];

test("accepts a workspace whose root configuration maps every exported subpath to its source", () => {
  withWorkspace(
    {
      exports: builtExports,
      files: builtFiles,
      compilerOptions: {
        paths: {
          "@example/library": ["./packages/library/src/index.ts"],
          "@example/library/orders": ["./packages/library/src/orders/index.ts"],
        },
      },
    },
    (root) => {
      assert.deepEqual(findSubpathsNotResolvingToSource(root), []);
    },
  );
});

test("flags an exported subpath the root configuration doesn't map while the build output is present", () => {
  withWorkspace(
    {
      exports: builtExports,
      files: builtFiles,
      compilerOptions: { paths: { "@example/library": ["./packages/library/src/index.ts"] } },
    },
    (root) => {
      assert.deepEqual(findSubpathsNotResolvingToSource(root).map(describeUnresolvedSubpath), [
        "@example/library/orders, imported from @example/shop, resolves to " +
          "packages/library/dist/orders/index.d.ts instead of the package's source",
      ]);
    },
  );
});

test("flags an exported subpath the root configuration doesn't map when there is no build output", () => {
  withWorkspace(
    {
      exports: builtExports,
      compilerOptions: { paths: { "@example/library": ["./packages/library/src/index.ts"] } },
    },
    (root) => {
      assert.deepEqual(findSubpathsNotResolvingToSource(root).map(describeUnresolvedSubpath), [
        "@example/library/orders, imported from @example/shop, does not resolve",
      ]);
    },
  );
});

test("accepts subpaths whose exports resolve to the source through a condition the root configuration enables", () => {
  withWorkspace(
    {
      exports: {
        ".": { source: "./src/index.ts", ...builtExports["."] },
        "./orders": { source: "./src/orders/index.ts", ...builtExports["./orders"] },
      },
      files: builtFiles,
      compilerOptions: { customConditions: ["source"] },
    },
    (root) => {
      assert.deepEqual(findSubpathsNotResolvingToSource(root), []);
    },
  );
});

test("accepts a package that exports its source directly", () => {
  withWorkspace(
    { exports: { ".": "./src/index.ts", "./orders": "./src/orders/index.ts" } },
    (root) => {
      assert.deepEqual(findSubpathsNotResolvingToSource(root), []);
    },
  );
});

test("reads an exports string as the package's root entry", () => {
  withWorkspace({ exports: "./src/index.ts" }, (root) => {
    assert.deepEqual(
      findWorkspaceSubpathImports(root).map(({ specifier }) => specifier),
      ["@example/library"],
    );
  });
});

test("reads exports made only of conditions as the package's root entry", () => {
  withWorkspace({ exports: builtExports["."], files: builtFiles }, (root) => {
    assert.deepEqual(findSubpathsNotResolvingToSource(root).map(describeUnresolvedSubpath), [
      "@example/library, imported from @example/shop, resolves to " +
        "packages/library/dist/index.d.ts instead of the package's source",
    ]);
  });
});

test("checks the root entry of a package without exports, which resolves through its main field", () => {
  withWorkspace({ files: builtFiles }, (root) => {
    assert.deepEqual(findSubpathsNotResolvingToSource(root).map(describeUnresolvedSubpath), [
      "@example/library, imported from @example/shop, resolves to " +
        "packages/library/dist/index.d.ts instead of the package's source",
    ]);
  });
});

test("skips an exported stylesheet, which is not a module TypeScript resolves", () => {
  withWorkspace(
    { exports: { ".": "./src/index.ts", "./tokens.css": "./src/tokens.css" }, files: [] },
    (root) => {
      writeFile(root, "packages/library/src/tokens.css", ":root {}\n");

      assert.deepEqual(findSubpathsNotResolvingToSource(root), []);
    },
  );
});

test("lists every subpath of a workspace dependency, once per package that depends on it", () => {
  withWorkspace({ exports: builtExports }, (root) => {
    assert.deepEqual(findWorkspaceSubpathImports(root), [
      {
        specifier: "@example/library",
        consumer: "@example/shop",
        consumerDirectory: "apps/shop",
        dependencyDirectory: "packages/library",
      },
      {
        specifier: "@example/library/orders",
        consumer: "@example/shop",
        consumerDirectory: "apps/shop",
        dependencyDirectory: "packages/library",
      },
    ]);
  });
});

test("every subpath a workspace package exports resolves to its source under the root configuration", () => {
  assert.ok(
    findWorkspaceSubpathImports().some(
      ({ specifier, consumer }) =>
        specifier === "@purosur/domain/sessions/use-cases" && consumer === "@purosur/cloud",
    ),
    "expected the check to cover @purosur/domain/sessions/use-cases imported from @purosur/cloud",
  );

  const unresolved = findSubpathsNotResolvingToSource();

  assert.deepEqual(unresolved.map(describeUnresolvedSubpath), []);
});
