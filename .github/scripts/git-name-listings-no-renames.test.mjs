import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findNameListingsWithRenames,
  findScannedFiles,
} from "./git-name-listings-no-renames.mjs";

function linesOf(source) {
  return findNameListingsWithRenames(source, "script.mjs").map(({ line }) => line);
}

for (const subcommand of ["diff", "log", "show"]) {
  for (const listing of ["--name-only", "--name-status"]) {
    test(`finds git ${subcommand} ${listing} without --no-renames`, () => {
      const source = `execFileSync("git", ["${subcommand}", "${listing}", base]);\n`;

      assert.deepEqual(linesOf(source), [1]);
    });

    test(`accepts git ${subcommand} ${listing} with --no-renames`, () => {
      const source = `execFileSync("git", ["${subcommand}", "--no-renames", "${listing}", base]);\n`;

      assert.deepEqual(linesOf(source), []);
    });
  }
}

test("finds a listing run through execFile, spawn or a function of its own that runs git", () => {
  const source = [
    'await promisify(execFile)("git", ["diff", "--name-only", sha]);',
    'spawn("git", ["log", "--name-status", sha]);',
    'await runGit(["show", "--name-only", sha]);',
  ].join("\n");

  assert.deepEqual(linesOf(source), [1, 2, 3]);
});

test("finds a listing whose arguments wait in a list before reaching git", () => {
  const source = [
    "const listings = [",
    '  ["diff", "--name-only", `${base}...HEAD`],',
    '  ["diff", "--no-renames", "--name-only", "HEAD"],',
    '  ["ls-files", "--others", "--exclude-standard"],',
    "];",
    "listings.flatMap((args) => runGit(args));",
  ].join("\n");

  assert.deepEqual(linesOf(source), [2]);
});

test("finds a listing that spreads its subcommand from a constant", () => {
  const source = [
    'const COMMIT_DIFF_ARGS = ["show", "--format="];',
    "",
    'runGit([...COMMIT_DIFF_ARGS, "--name-only", commit]);',
    'runGit([...COMMIT_DIFF_ARGS, "--unified=0", commit]);',
  ].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

test("accepts a listing whose --no-renames comes from the constant it spreads", () => {
  const source = [
    'const COMMIT_DIFF_ARGS = ["show", "--no-renames", "--format="];',
    'runGit([...COMMIT_DIFF_ARGS, "--name-only", commit]);',
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("judges a constant that holds the listing where it is extended, not on its own", () => {
  const source = [
    'const NAMES = ["diff", "--name-only"];',
    'runGit([...NAMES, "--no-renames", base]);',
    "runGit([...NAMES, base]);",
  ].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

test("finds a constant that holds the listing and reaches git as it is", () => {
  const source = ['const NAMES = ["diff", "--name-only", base];', "runGit(NAMES);"].join("\n");

  assert.deepEqual(linesOf(source), [1]);
});

test("follows constants spread through other constants", () => {
  const source = [
    'const SUBCOMMAND = ["log"];',
    'const LISTING = [...SUBCOMMAND, "--name-only"];',
    'runGit([...LISTING, "--format=", sha]);',
  ].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

test("finds a listing built by concatenating several arrays", () => {
  const source = [
    'const SUBCOMMAND = ["diff"];',
    'const LISTING = ["--name-status"];',
    "runGit(SUBCOMMAND.concat(LISTING, [base]));",
    'runGit(SUBCOMMAND.concat(LISTING, ["--no-renames", base]));',
  ].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

test("finds a git command string run through execSync", () => {
  const source = [
    'execSync("git diff --name-only origin/main...HEAD");',
    "execSync(`git log --name-status ${base}..HEAD`);",
    'execSync("git show --no-renames --name-only " + sha);',
  ].join("\n");

  assert.deepEqual(linesOf(source), [1, 2]);
});

test("finds a git command string kept in a constant or built from several parts", () => {
  const source = [
    'const LIST = "git diff --name-only";',
    "execSync(`${LIST} ${base}`);",
    'execSync("git log " + "--name-only " + sha);',
  ].join("\n");

  assert.deepEqual(linesOf(source), [2, 3]);
});

test("accepts git calls that list no names", () => {
  const source = [
    'runGit(["diff", "--unified=0", base]);',
    'runGit(["log", "--format=%H", base]);',
    'runGit(["show", "--format=", sha]);',
    'runGit(["ls-files", "--name-only"]);',
    'runGit(["ls-tree", "-r", "--name-only", sha]);',
    'execSync("git diff --stat");',
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("accepts a listing option that is only a path after the end of the options", () => {
  const source = 'runGit(["log", "--format=", "--", "--name-only"]);\n';

  assert.deepEqual(linesOf(source), []);
});

test("accepts arrays and strings that are not git invocations", () => {
  const source = [
    'const words = ["show", "less"];',
    'const message = "the git diff is empty";',
    'spawn("pnpm", ["test"]);',
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("reports a listing on the line its arguments start and says to add --no-renames", () => {
  const files = {
    "a.mjs": ['import x from "y";', "runGit([", '  "diff",', '  "--name-only",', "]);"].join(
      "\n",
    ),
    "b.mjs": 'runGit(["diff", "--no-renames", "--name-only"]);\n',
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.deepEqual(violations.map(describeViolation), [
    "a.mjs:2: runGit([ lists changed names with git's rename detection; add --no-renames",
  ]);
});

test("scans every script of the folder and none of its tests or test helpers", () => {
  const files = findScannedFiles(".", () => [
    "change-scope.mjs",
    "change-scope.test.mjs",
    "slow-tests-reporter.d.mts",
    "test-support/fixture.mjs",
  ]);

  assert.deepEqual(files, [".github/scripts/change-scope.mjs"]);
});

test("no script of the repository lists changed names with git's rename detection", () => {
  const files = findScannedFiles();
  for (const sentinel of [
    ".github/scripts/change-scope.mjs",
    ".github/scripts/tests-beside-changes.mjs",
    ".github/scripts/no-secrets-in-commit-history.mjs",
  ]) {
    assert.ok(files.includes(sentinel), `expected the scan to include ${sentinel}`);
  }

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "a renamed file's old path is missing from the listing unless git runs with --no-renames",
  );
});
