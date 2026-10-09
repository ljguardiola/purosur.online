import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  changedFilesSince,
  MIGRATION_TESTS,
  projectsOfSpecifications,
  runChangedTests,
  runCommand,
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

const CLOUD_MIGRATION_TESTS = [
  "apps/cloud/src/platform/db/migrate-cloud-app-role.integration.test.ts",
  "apps/cloud/src/platform/db/schema.test.ts",
  "apps/cloud/src/test-support/build-test-database.test.ts",
];
const REGISTER_MIGRATION_TESTS = ["apps/pos/src/core/platform/local-migrations.test.ts"];
const TEST_FILES_WITH_MIGRATION_TESTS = [
  ...TEST_FILES,
  ...CLOUD_MIGRATION_TESTS,
  ...REGISTER_MIGRATION_TESTS,
];

test("runs every test that applies the cloud migrations when a cloud migration changes", () => {
  assert.deepEqual(
    testsToRun({
      testFiles: TEST_FILES_WITH_MIGRATION_TESTS,
      changedFiles: ["apps/cloud/migrations/0042_new_table.sql"],
      requestedFiles: [],
    }),
    CLOUD_MIGRATION_TESTS,
  );
});

test("runs every test that applies the register migrations when a register migration changes", () => {
  assert.deepEqual(
    testsToRun({
      testFiles: TEST_FILES_WITH_MIGRATION_TESTS,
      changedFiles: ["apps/pos/src/core/migrations/0042_new_table.sql"],
      requestedFiles: [],
    }),
    REGISTER_MIGRATION_TESTS,
  );
});

test("runs no migration test when no migration changes", () => {
  assert.deepEqual(
    testsToRun({
      testFiles: TEST_FILES_WITH_MIGRATION_TESTS,
      changedFiles: ["apps/cloud/src/catalog/drizzle-catalog-store.ts"],
      requestedFiles: [],
    }),
    ["apps/cloud/src/catalog/drizzle-catalog-store.integration.test.ts"],
  );
});

test("refuses a migration test that is no longer a test file", () => {
  assert.throws(
    () =>
      testsToRun({
        testFiles: TEST_FILES,
        changedFiles: ["apps/cloud/migrations/0042_new_table.sql"],
        requestedFiles: [],
      }),
    /apps\/cloud\/src\/platform\/db\/migrate-cloud-app-role\.integration\.test\.ts is not a test file/,
  );
});

test("names only test files of the repository as the tests that apply the migrations", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const testFiles = MIGRATION_TESTS.flatMap(({ tests }) => tests);
  assert.deepEqual(testFiles.toSorted(), [...CLOUD_MIGRATION_TESTS, ...REGISTER_MIGRATION_TESTS]);
  for (const testFile of testFiles) {
    assert.match(testFile, /\.test\.ts$/);
    assert.ok(statSync(`${root}${testFile}`).isFile(), `${testFile} is missing`);
  }
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

const PROJECTS = new Map([
  ["packages/domain/src/catalog/model/price.test.ts", ["domain"]],
  ["apps/backoffice/src/catalog/product-form.test.tsx", ["backoffice"]],
  ["packages/ui/src/button.test.tsx", ["ui", "ui-browser"]],
]);

function recordingRunner(failingProject) {
  const runs = [];
  return {
    runs,
    run: async (args) => {
      runs.push(args);
      return !args.includes(`--project=${failingProject}`);
    },
  };
}

test("runs each project's selected files by absolute path, one file at a time", async () => {
  const { runs, run } = recordingRunner();

  const exitCode = await runChangedTests({
    root: "/repo",
    projects: PROJECTS,
    changedFiles: [
      "packages/domain/src/catalog/model/price.ts",
      "apps/backoffice/src/catalog/product-form.tsx",
      "packages/ui/src/button.tsx",
    ],
    requestedFiles: [],
    run,
    log: () => {},
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(runs, [
    [
      "run",
      "--project=backoffice",
      "--no-file-parallelism",
      "/repo/apps/backoffice/src/catalog/product-form.test.tsx",
    ],
    [
      "run",
      "--project=domain",
      "--no-file-parallelism",
      "/repo/packages/domain/src/catalog/model/price.test.ts",
    ],
    ["run", "--project=ui", "--no-file-parallelism", "/repo/packages/ui/src/button.test.tsx"],
    [
      "run",
      "--project=ui-browser",
      "--no-file-parallelism",
      "/repo/packages/ui/src/button.test.tsx",
    ],
  ]);
});

test("exits with a failure when a project's run fails", async () => {
  const { run } = recordingRunner("domain");

  const exitCode = await runChangedTests({
    root: "/repo",
    projects: PROJECTS,
    changedFiles: ["packages/domain/src/catalog/model/price.ts"],
    requestedFiles: [],
    run,
    log: () => {},
  });

  assert.equal(exitCode, 1);
});

test("runs nothing and says so when no test is selected", async () => {
  const { runs, run } = recordingRunner();
  const logged = [];

  const exitCode = await runChangedTests({
    root: "/repo",
    projects: PROJECTS,
    changedFiles: ["packages/domain/package.json"],
    requestedFiles: [],
    run,
    log: (message) => logged.push(message),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(runs, []);
  assert.deepEqual(logged, [
    "No test file sits beside a changed file, and none was asked for by path.",
  ]);
});

test("runs nothing and fails when a path asked for is not a test file", async () => {
  const { runs, run } = recordingRunner();
  const logged = [];

  const exitCode = await runChangedTests({
    root: "/repo",
    projects: PROJECTS,
    changedFiles: ["packages/domain/src/catalog/model/price.ts"],
    requestedFiles: ["packages/ui/src/button.tsx"],
    run,
    log: (message) => logged.push(message),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(runs, []);
  assert.deepEqual(logged, ["packages/ui/src/button.tsx is not a test file"]);
});

test("maps each test file, relative to the root, to every project that holds it", () => {
  const root = "/repo";
  assert.deepEqual(
    projectsOfSpecifications({
      root,
      specifications: [
        { moduleId: "/repo/packages/ui/src/button.test.tsx", project: { name: "ui" } },
        { moduleId: "/repo/apps/cloud/src/app.test.ts", project: { name: "cloud" } },
        { moduleId: "/repo/packages/ui/src/button.test.tsx", project: { name: "ui-browser" } },
      ],
    }),
    new Map([
      ["packages/ui/src/button.test.tsx", ["ui", "ui-browser"]],
      ["apps/cloud/src/app.test.ts", ["cloud"]],
    ]),
  );
});

test("reports a command that exits with success as passed", async () => {
  assert.equal(
    await runCommand({ command: process.execPath, args: ["-e", "process.exit(0)"], cwd: "." }),
    true,
  );
});

test("reports a command that exits with a failure as failed", async () => {
  assert.equal(
    await runCommand({ command: process.execPath, args: ["-e", "process.exit(1)"], cwd: "." }),
    false,
  );
});
