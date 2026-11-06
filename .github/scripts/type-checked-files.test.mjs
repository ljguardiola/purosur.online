import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { projectWith } from "./test-support/own-entry-key-lookups.mjs";
import { findUncheckedTypeScriptFiles, typeCheckedTsconfigs } from "./type-checked-files.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function tsconfigIncluding(...include) {
  return JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include });
}

function uncheckedIn(t, files, tsconfigs = ["tsconfig.json"]) {
  return findUncheckedTypeScriptFiles(projectWith(t, files), {
    tsconfigs,
    trackedFiles: Object.keys(files),
  });
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

test("every tracked TypeScript file is in a program the type check reads", () => {
  assert.deepEqual(
    findUncheckedTypeScriptFiles(repoRoot),
    [],
    "add the file to the include of a tsconfig the type check reads; name a dot-folder's files with a pattern such as `.storybook/*`",
  );
});
