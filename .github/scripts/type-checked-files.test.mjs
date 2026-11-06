import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { projectWith } from "./test-support/own-entry-key-lookups.mjs";
import { findTypeCheckGaps, typeCheckedTsconfigs } from "./type-checked-files.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function tsconfigIncluding(...include) {
  return JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      module: "ESNext",
      moduleResolution: "Bundler",
    },
    include,
  });
}

function gapsIn(t, files, { tsconfigs = ["tsconfig.json"], untracked = {} } = {}) {
  return findTypeCheckGaps(projectWith(t, { ...files, ...untracked }), {
    tsconfigs,
    trackedFiles: Object.keys(files),
  });
}

function uncheckedIn(t, files, tsconfigs) {
  return gapsIn(t, files, { tsconfigs }).unchecked;
}

function declarationErrorsIn(t, files, options) {
  return gapsIn(t, files, options).declarationErrors;
}

test("refuses a tracked TypeScript file no checked program includes, naming it", (t) => {
  const unchecked = uncheckedIn(t, {
    "tsconfig.json": tsconfigIncluding("src"),
    "src/checked.ts": "export const checked = 1;",
    "scripts/left-out.ts": "export const leftOut = 1;",
    "scripts/left-out.test.tsx": "export const leftOutTest = 1;",
  });

  assert.deepEqual(unchecked, ["scripts/left-out.test.tsx", "scripts/left-out.ts"]);
});

test("refuses an ES module and a CommonJS TypeScript file no checked program includes", (t) => {
  const unchecked = uncheckedIn(t, {
    "tsconfig.json": tsconfigIncluding("src"),
    "src/checked.ts": "export const checked = 1;",
    "scripts/left-out.mts": "export const leftOut = 1;",
    "scripts/left-out.cts": "export const leftOut = 1;",
  });

  assert.deepEqual(unchecked, ["scripts/left-out.cts", "scripts/left-out.mts"]);
});

test("refuses a file of a dot-folder the include names without a pattern", (t) => {
  const unchecked = uncheckedIn(t, {
    "tsconfig.json": tsconfigIncluding("src", "tools/.config"),
    "src/checked.ts": "export const checked = 1;",
    "tools/.config/main.ts": "export const main = 1;",
  });

  assert.deepEqual(unchecked, ["tools/.config/main.ts"]);
});

test("accepts a file a program includes, one only imported by an included file, and one another program includes", (t) => {
  const unchecked = uncheckedIn(
    t,
    {
      "tsconfig.json": tsconfigIncluding("src"),
      "tools/tsconfig.json": tsconfigIncluding("*.ts"),
      "src/checked.ts": 'export { imported } from "../shared/imported.ts";',
      "shared/imported.ts": "export const imported = 1;",
      "tools/tool.ts": "export const tool = 1;",
    },
    ["tsconfig.json", "tools/tsconfig.json"],
  );

  assert.deepEqual(unchecked, []);
});

test("ignores tracked files that are not TypeScript", (t) => {
  const unchecked = uncheckedIn(t, {
    "tsconfig.json": tsconfigIncluding("src"),
    "src/checked.ts": "export const checked = 1;",
    "scripts/tool.mjs": "export const tool = 1;",
    "README.md": "# Readme",
  });

  assert.deepEqual(unchecked, []);
});

test("refuses a tracked declaration file no checked program includes", (t) => {
  const unchecked = uncheckedIn(t, {
    "tsconfig.json": tsconfigIncluding("src"),
    "src/checked.ts": "export const checked = 1;",
    "types/left-out.d.ts": "declare const leftOut: number;",
    "types/left-out.d.mts": "export declare const leftOut: number;",
    "types/left-out.d.cts": "export declare const leftOut: number;",
  });

  assert.deepEqual(unchecked, [
    "types/left-out.d.cts",
    "types/left-out.d.mts",
    "types/left-out.d.ts",
  ]);
});

test("refuses a type error in a tracked declaration file although its program skips declaration files", (t) => {
  const declarationErrors = declarationErrorsIn(t, {
    "tsconfig.json": tsconfigIncluding("src"),
    "src/checked.ts": "export const checked = 1;",
    "src/env.d.ts": "declare const value: Missing;",
    "src/reporter.d.mts": "export declare const value: Missing;",
    "src/reporter.d.cts": "export declare const value: Missing;",
  });

  assert.deepEqual(declarationErrors, [
    "src/env.d.ts(1,22): Cannot find name 'Missing'.",
    "src/reporter.d.cts(1,29): Cannot find name 'Missing'.",
    "src/reporter.d.mts(1,29): Cannot find name 'Missing'.",
  ]);
});

test("refuses a type error in a tracked declaration file only imported by an included file", (t) => {
  const declarationErrors = declarationErrorsIn(t, {
    "tsconfig.json": tsconfigIncluding("src"),
    "src/checked.ts": 'export { reporter } from "../scripts/reporter.mjs";',
    "scripts/reporter.mjs": "export const reporter = 1;",
    "scripts/reporter.d.mts": "export declare const reporter: Missing;",
  });

  assert.deepEqual(declarationErrors, [
    "scripts/reporter.d.mts(1,32): Cannot find name 'Missing'.",
  ]);
});

test("reports a declaration file's error once when several programs include it", (t) => {
  const declarationErrors = declarationErrorsIn(
    t,
    {
      "tsconfig.json": tsconfigIncluding("src"),
      "tools/tsconfig.json": tsconfigIncluding("*.ts", "../src"),
      "src/env.d.ts": "declare const value: Missing;",
      "tools/tool.ts": "export const tool = 1;",
    },
    { tsconfigs: ["tsconfig.json", "tools/tsconfig.json"] },
  );

  assert.deepEqual(declarationErrors, ["src/env.d.ts(1,22): Cannot find name 'Missing'."]);
});

test("leaves the declaration files of installed dependencies unchecked", (t) => {
  const declarationErrors = declarationErrorsIn(
    t,
    {
      "tsconfig.json": tsconfigIncluding("src"),
      "src/checked.ts": 'export { dependency } from "dependency";',
    },
    {
      untracked: {
        "node_modules/dependency/package.json": JSON.stringify({
          name: "dependency",
          types: "index.d.ts",
        }),
        "node_modules/dependency/index.d.ts": "export declare const dependency: Missing;",
      },
    },
  );

  assert.deepEqual(declarationErrors, []);
});

test("accepts a tracked declaration file without type errors", (t) => {
  const declarationErrors = declarationErrorsIn(t, {
    "tsconfig.json": tsconfigIncluding("src"),
    "src/env.d.ts": "declare const value: number;",
  });

  assert.deepEqual(declarationErrors, []);
});

test("reads the checked programs from the type-check script, defaulting a folder to its tsconfig.json", () => {
  assert.deepEqual(
    typeCheckedTsconfigs(
      "tsc --noEmit && tsc --noEmit -p .railway && tsc --noEmit -p apps/cloud/tsconfig.test.json",
    ),
    ["tsconfig.json", ".railway/tsconfig.json", "apps/cloud/tsconfig.test.json"],
  );
});

test("refuses a type-check script step that is not a tsc run", () => {
  assert.throws(() => typeCheckedTsconfigs("tsc --noEmit && vue-tsc --noEmit"), /vue-tsc --noEmit/);
});

test("every tracked TypeScript file is in a program the type check reads, and every tracked declaration file type-checks", () => {
  const { unchecked, declarationErrors } = findTypeCheckGaps(repoRoot);

  assert.deepEqual(
    unchecked,
    [],
    "add the file to the include of a tsconfig the type check reads; name a dot-folder's files with a pattern such as `.storybook/*`",
  );
  assert.deepEqual(declarationErrors, [], "fix the type errors of these declaration files");
});
