import { execFileSync, spawn } from "node:child_process";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBaseRef } from "./change-base.mjs";

const TEST_SUPPORT = "test-support";

export const MIGRATION_TESTS = [
  {
    folder: "apps/cloud/migrations/",
    tests: [
      "apps/cloud/src/platform/db/migrate-cloud-app-role.integration.test.ts",
      "apps/cloud/src/platform/db/schema.test.ts",
      "apps/cloud/src/test-support/build-test-database.test.ts",
    ],
  },
  {
    folder: "apps/pos/src/core/migrations/",
    tests: ["apps/pos/src/core/platform/local-migrations.test.ts"],
  },
];

function stemOf(path) {
  const name = posix.basename(path);
  const extensionStart = name.lastIndexOf(".");
  return extensionStart > 0 ? name.slice(0, extensionStart) : name;
}

function foldersServedBy(changedFile) {
  const folder = posix.dirname(changedFile);
  return posix.basename(folder) === TEST_SUPPORT ? [folder, posix.dirname(folder)] : [folder];
}

function isBeside(testFile, changedFile) {
  const prefix = `${stemOf(changedFile)}.`;
  return (
    foldersServedBy(changedFile).includes(posix.dirname(testFile)) &&
    posix.basename(testFile).startsWith(prefix)
  );
}

export function selectTestsBeside({ testFiles, changedFiles }) {
  return testFiles
    .filter((testFile) => changedFiles.some((changedFile) => isBeside(testFile, changedFile)))
    .sort();
}

export function changedFilesSince({ base, runGit }) {
  const listings = [
    ["diff", "--name-only", `${base}...HEAD`],
    ["diff", "--name-only", "HEAD"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  const files = listings.flatMap((args) =>
    runGit(args)
      .toString("utf8")
      .split("\n")
      .filter((line) => line !== ""),
  );
  return [...new Set(files)];
}

function testsApplyingChangedMigrations(changedFiles) {
  return MIGRATION_TESTS.filter(({ folder }) =>
    changedFiles.some((changedFile) => changedFile.startsWith(folder)),
  ).flatMap(({ tests }) => tests);
}

export function testsToRun({ testFiles, changedFiles, requestedFiles }) {
  const known = new Set(testFiles);
  const named = [...testsApplyingChangedMigrations(changedFiles), ...requestedFiles];
  for (const testFile of named) {
    if (!known.has(testFile)) {
      throw new Error(`${testFile} is not a test file`);
    }
  }
  return [...new Set([...selectTestsBeside({ testFiles, changedFiles }), ...named])].sort();
}

export async function runProjectsInTurn({ filesByProject, run }) {
  let passed = true;
  for (const [project, files] of filesByProject) {
    if (!(await run(project, files))) {
      passed = false;
    }
  }
  return passed;
}

export function projectsOfSpecifications({ root, specifications }) {
  const projects = new Map();
  for (const specification of specifications) {
    const file = relative(root, specification.moduleId).split(sep).join("/");
    projects.set(file, [...(projects.get(file) ?? []), specification.project.name]);
  }
  return projects;
}

async function projectsByTestFile(root) {
  const { createVitest } = await import("vitest/node");
  const vitest = await createVitest("test", { root, watch: false });
  try {
    return projectsOfSpecifications({
      root,
      specifications: await vitest.globTestSpecifications(),
    });
  } finally {
    await vitest.close();
  }
}

export function runCommand({ command, args, cwd }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("close", (code) => resolve(code === 0));
  });
}

function groupByProject({ files, projects }) {
  const filesByProject = new Map();
  for (const file of files) {
    for (const project of projects.get(file)) {
      filesByProject.set(project, [...(filesByProject.get(project) ?? []), file]);
    }
  }
  return filesByProject;
}

export async function runChangedTests({ root, projects, changedFiles, requestedFiles, run, log }) {
  let files;
  try {
    files = testsToRun({ testFiles: [...projects.keys()], changedFiles, requestedFiles });
  } catch (error) {
    log(error.message);
    return 1;
  }
  if (files.length === 0) {
    log("No test file sits beside a changed file, and none was asked for by path.");
    return 0;
  }

  const passed = await runProjectsInTurn({
    filesByProject: groupByProject({ files, projects }),
    run: (project, projectFiles) =>
      run([
        "run",
        `--project=${project}`,
        "--no-file-parallelism",
        ...projectFiles.map((file) => join(root, file)),
      ]),
  });
  return passed ? 0 : 1;
}

async function runCli(requestedFiles) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const runGit = (args) => execFileSync("git", args, { cwd: root });
  return runChangedTests({
    root,
    projects: await projectsByTestFile(root),
    changedFiles: changedFilesSince({ base: resolveBaseRef(process.env), runGit }),
    requestedFiles,
    run: (args) => runCommand({ command: join(root, "node_modules/.bin/vitest"), args, cwd: root }),
    log: console.log,
  });
}

if (import.meta.main) {
  runCli(process.argv.slice(2)).then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
