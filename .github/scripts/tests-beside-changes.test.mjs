import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changedFilesSince,
  runProjectsInTurn,
  selectTestsBeside,
  testsToRun,
} from "./tests-beside-changes.mjs";

const TEST_FILES = [
  "packages/domain/src/pricing/model/price.test.ts",
  "packages/domain/src/pricing/model/price.rounding.test.ts",
  "packages/domain/src/pricing/model/price-list.test.ts",
  "packages/domain/src/catalog/model/price.test.ts",
  "apps/cloud/src/catalog/drizzle-catalog-store.integration.test.ts",
  "apps/backoffice/src/catalog/products-list-screen.create.test.tsx",
  "apps/backoffice/src/catalog/products-list-screen.edit.test.tsx",
  "apps/backoffice/src/catalog/product-form.test.tsx",
];

test("selects a changed file's own tests and the tests of each of its aspects", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/src/pricing/model/price.ts"],
    }),
    [
      "packages/domain/src/pricing/model/price.rounding.test.ts",
      "packages/domain/src/pricing/model/price.test.ts",
    ],
  );
});

test("leaves out a test whose name only starts with the changed file's name", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/src/pricing/model/price-list.ts"],
    }),
    ["packages/domain/src/pricing/model/price-list.test.ts"],
  );
});

test("leaves out a test of the same name in another folder", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/src/catalog/model/price.ts"],
    }),
    ["packages/domain/src/catalog/model/price.test.ts"],
  );
});

test("selects a changed test file itself", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["apps/backoffice/src/catalog/products-list-screen.edit.test.tsx"],
    }),
    ["apps/backoffice/src/catalog/products-list-screen.edit.test.tsx"],
  );
});

test("selects an adapter's integration tests", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["apps/cloud/src/catalog/drizzle-catalog-store.ts"],
    }),
    ["apps/cloud/src/catalog/drizzle-catalog-store.integration.test.ts"],
  );
});

test("selects the aspect tests whose setup a changed test-support file holds", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["apps/backoffice/src/catalog/test-support/products-list-screen.tsx"],
    }),
    [
      "apps/backoffice/src/catalog/products-list-screen.create.test.tsx",
      "apps/backoffice/src/catalog/products-list-screen.edit.test.tsx",
    ],
  );
});

test("selects nothing for a package manifest or index that most tests import", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/package.json", "packages/domain/src/index.ts"],
    }),
    [],
  );
});

test("selects a test once when several changed files sit beside it", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: [
        "apps/backoffice/src/catalog/product-form.tsx",
        "apps/backoffice/src/catalog/product-form.test.tsx",
      ],
    }),
    ["apps/backoffice/src/catalog/product-form.test.tsx"],
  );
});

test("lists the files committed since the merge-base, the uncommitted ones and the untracked ones, once each", () => {
  const outputs = new Map([
    ["diff --name-only origin/main...HEAD", "a.ts\nb.ts\n"],
    ["diff --name-only HEAD", "b.ts\nc.ts\n"],
    ["ls-files --others --exclude-standard", "d.ts\n"],
  ]);
  const runGit = (args) => Buffer.from(outputs.get(args.join(" ")) ?? "", "utf8");

  assert.deepEqual(changedFilesSince({ base: "origin/main", runGit }), [
    "a.ts",
    "b.ts",
    "c.ts",
    "d.ts",
  ]);
});

test("runs the tests beside the changed files together with the test files asked for by path", () => {
  assert.deepEqual(
    testsToRun({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/src/catalog/model/price.ts"],
      requestedFiles: ["apps/cloud/src/catalog/drizzle-catalog-store.integration.test.ts"],
    }),
    [
      "apps/cloud/src/catalog/drizzle-catalog-store.integration.test.ts",
      "packages/domain/src/catalog/model/price.test.ts",
    ],
  );
});

test("refuses a path asked for that is not a test file", () => {
  assert.throws(
    () =>
      testsToRun({
        testFiles: TEST_FILES,
        changedFiles: [],
        requestedFiles: ["apps/cloud/src/catalog/drizzle-catalog-store.integration.test.tsx"],
      }),
    /apps\/cloud\/src\/catalog\/drizzle-catalog-store\.integration\.test\.tsx is not a test file/,
  );
});

test("runs each project's files in a run of their own, one project after another", async () => {
  const runs = [];
  let running = 0;
  const run = async (project, files) => {
    running += 1;
    runs.push({ project, files, alongside: running - 1 });
    await Promise.resolve();
    running -= 1;
    return true;
  };

  const passed = await runProjectsInTurn({
    filesByProject: new Map([
      ["node", ["a.test.ts", "b.test.ts"]],
      ["browser", ["c.test.tsx"]],
    ]),
    run,
  });

  assert.equal(passed, true);
  assert.deepEqual(runs, [
    { project: "node", files: ["a.test.ts", "b.test.ts"], alongside: 0 },
    { project: "browser", files: ["c.test.tsx"], alongside: 0 },
  ]);
});

test("keeps running the remaining projects after one fails, and reports the failure", async () => {
  const ran = [];
  const run = async (project) => {
    ran.push(project);
    return project !== "node";
  };

  const passed = await runProjectsInTurn({
    filesByProject: new Map([
      ["node", ["a.test.ts"]],
      ["browser", ["c.test.tsx"]],
    ]),
    run,
  });

  assert.equal(passed, false);
  assert.deepEqual(ran, ["node", "browser"]);
});
