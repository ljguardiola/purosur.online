import { execFileSync } from "node:child_process";
import { posix, relative, sep } from "node:path";
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
    runGit(args).toString("utf8").split("\n").filter((line) => line !== ""),
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
  return [...new Set([...selectTestsBeside({ testFiles, changedFiles }), ...requestedFiles])].sort();
}

export async function runEachFileAlone({ files, run }) {
  let passed = true;
  for (const file of files) {
    if (!(await run([file]))) {
      passed = false;
    }
  }
  return passed;
}

async function runCli(requestedFiles) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const runGit = (args) => execFileSync("git", args, { cwd: root });
  const changedFiles = changedFilesSince({ base: resolveBaseRef(process.env), runGit });

  const { createVitest } = await import("vitest/node");
  const vitest = await createVitest("test", { root, watch: false });
  try {
    const specificationsByFile = new Map();
    for (const specification of await vitest.globTestSpecifications()) {
      const file = relative(root, specification.moduleId).split(sep).join("/");
      specificationsByFile.set(file, [...(specificationsByFile.get(file) ?? []), specification]);
    }
    const files = testsToRun({
      testFiles: [...specificationsByFile.keys()],
      changedFiles,
      requestedFiles,
    });
    if (files.length === 0) {
      console.log("No test file sits beside a changed file, and none was asked for by path.");
      return 0;
    }

    const failedFiles = [];
    const passed = await runEachFileAlone({
      files,
      run: async ([file]) => {
        const result = await vitest.runTestSpecifications(specificationsByFile.get(file));
        const filePassed =
          result.unhandledErrors.length === 0 && result.testModules.every((module) => module.ok());
        if (!filePassed) {
          failedFiles.push(file);
        }
        return filePassed;
      },
    });
    console.log(`Ran ${files.length} test files, one at a time.`);
    if (!passed) {
      console.error(`Failed:\n${failedFiles.map((file) => `  ${file}`).join("\n")}`);
    }
    return passed ? 0 : 1;
  } finally {
    await vitest.close();
  }
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
