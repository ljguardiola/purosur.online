import { execFileSync, spawn } from "node:child_process";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBaseRef } from "./change-base.mjs";

const TEST_SUPPORT = "test-support";

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

export function testsToRun({ testFiles, changedFiles, requestedFiles }) {
  const known = new Set(testFiles);
  for (const requested of requestedFiles) {
    if (!known.has(requested)) {
      throw new Error(`${requested} is not a test file`);
    }
  }
  return [
    ...new Set([...selectTestsBeside({ testFiles, changedFiles }), ...requestedFiles]),
  ].sort();
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

async function projectsByTestFile(root) {
  const { createVitest } = await import("vitest/node");
  const vitest = await createVitest("test", { root, watch: false });
  try {
    const projects = new Map();
    for (const specification of await vitest.globTestSpecifications()) {
      const file = relative(root, specification.moduleId).split(sep).join("/");
      projects.set(file, [...(projects.get(file) ?? []), specification.project.name]);
    }
    return projects;
  } finally {
    await vitest.close();
  }
}

function runVitest(root, args) {
  return new Promise((resolve) => {
    const child = spawn(join(root, "node_modules/.bin/vitest"), args, {
      cwd: root,
      stdio: "inherit",
    });
    child.on("close", (code) => resolve(code === 0));
  });
}

async function runCli(requestedFiles) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const runGit = (args) => execFileSync("git", args, { cwd: root });
  const changedFiles = changedFilesSince({ base: resolveBaseRef(process.env), runGit });

  const projects = await projectsByTestFile(root);
  const files = testsToRun({ testFiles: [...projects.keys()], changedFiles, requestedFiles });
  if (files.length === 0) {
    console.log("No test file sits beside a changed file, and none was asked for by path.");
    return 0;
  }

  const filesByProject = new Map();
  for (const file of files) {
    for (const project of projects.get(file)) {
      filesByProject.set(project, [...(filesByProject.get(project) ?? []), file]);
    }
  }
  const passed = await runProjectsInTurn({
    filesByProject,
    run: (project, projectFiles) =>
      runVitest(root, [
        "run",
        `--project=${project}`,
        "--no-file-parallelism",
        ...projectFiles.map((file) => join(root, file)),
      ]),
  });
  return passed ? 0 : 1;
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
