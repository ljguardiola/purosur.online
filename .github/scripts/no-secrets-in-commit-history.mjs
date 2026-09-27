import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkFiles, isSecretCarrier } from "./no-secrets-in-tracked-files.mjs";

const HUNK_ADDED_RANGE_RE = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm;
const BINARY_PATCH_RE = /^Binary files .* differ$/m;

function runGit(args, cwd) {
  return execFileSync("git", ["--literal-pathspecs", ...args], {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
}

// A merge commit's own changes are what it adds beyond git's automatic merge of its parents, such
// as a conflict resolution; a diff against either parent would repeat the other side's commits.
const COMMIT_DIFF_ARGS = ["show", "--format=", "--diff-merges=remerge"];

export function listCommitsSince(base, cwd = process.cwd()) {
  return runGit(["rev-list", "--reverse", `${base}..HEAD`], cwd)
    .toString("utf8")
    .split("\n")
    .filter((sha) => sha !== "");
}

function changedPathsOf(commit, cwd) {
  return runGit([...COMMIT_DIFF_ARGS, "--name-only", "-z", "--diff-filter=d", commit], cwd)
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "");
}

function addedLinesOf(commit, path, cwd) {
  const patch = runGit(
    [...COMMIT_DIFF_ARGS, "--unified=0", "--no-color", "--no-ext-diff", commit, "--", path],
    cwd,
  ).toString("utf8");
  // git prints no hunks for a file it takes as binary, such as text holding a NUL byte, so every
  // line of it counts as added.
  if (BINARY_PATCH_RE.test(patch)) return null;
  const lines = new Set();
  for (const [, start, count = "1"] of patch.matchAll(HUNK_ADDED_RANGE_RE)) {
    for (let offset = 0; offset < Number(count); offset++) lines.add(Number(start) + offset);
  }
  return lines;
}

function addsAnyLineOf(addedLines, line, endLine) {
  if (addedLines === null) return true;
  for (let current = line; current <= endLine; current++) {
    if (addedLines.has(current)) return true;
  }
  return false;
}

async function checkCommit(commit, { cwd, configFilePath }) {
  const paths = changedPathsOf(commit, cwd);
  const snapshot = mkdtempSync(join(tmpdir(), "commit-snapshot-"));
  try {
    for (const path of paths) {
      mkdirSync(dirname(join(snapshot, path)), { recursive: true });
      writeFileSync(join(snapshot, path), runGit(["show", `${commit}:${path}`], cwd));
    }
    const violations = await checkFiles(paths, { cwd: snapshot, configFilePath });
    const addedLinesByPath = new Map();
    const addedLinesIn = (path) => {
      if (!addedLinesByPath.has(path)) addedLinesByPath.set(path, addedLinesOf(commit, path, cwd));
      return addedLinesByPath.get(path);
    };
    return violations
      .filter(
        ({ path, line, endLine }) =>
          isSecretCarrier(path) || addsAnyLineOf(addedLinesIn(path), line, endLine),
      )
      .map((violation) => ({ commit, ...violation }));
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}

export async function checkCommits(commits, { cwd = process.cwd(), configFilePath }) {
  const violations = [];
  for (const commit of commits) {
    violations.push(...(await checkCommit(commit, { cwd, configFilePath })));
  }
  return violations;
}

export function describeCommitViolation({ commit, path, line, message }) {
  return `commit ${commit} added ${path}:${line}: ${message} — rotate this secret, removing it leaves it readable in that commit`;
}
