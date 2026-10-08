import { posix } from "node:path";

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
