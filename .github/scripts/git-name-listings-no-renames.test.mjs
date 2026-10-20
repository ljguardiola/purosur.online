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
    `  ["diff", "--name-only", \`\${base}...HEAD\`],`,
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

test("resolves each constant to the declaration in scope where it is used", () => {
  const source = [
    "function listNames(base) {",
    '  const args = ["diff", "--name-only"];',
    "  return runGit([...args, base]);",
    "}",
    "function listHunks(base) {",
    '  const args = ["diff", "--no-renames", "--unified=0"];',
    "  return runGit([...args, base]);",
    "}",
  ].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

test("judges a constant by the uses of its own declaration, not of another with its name", () => {
  const source = [
    "function listNames(base) {",
    '  const args = ["diff", "--name-only"];',
    '  return runGit([...args, "--no-renames", base]);',
    "}",
    "function listCommits() {",
    '  const args = ["log", "--format=%H"];',
    "  return runGit(args);",
    "}",
  ].join("\n");

  assert.deepEqual(linesOf(source), []);
});

test("resolves a constant to the block it is declared in, not to another block of the same function", () => {
  const source = [
    "function list(names, base) {",
    "  if (names) {",
    '    const args = ["diff", "--name-only"];',
    "    runGit([...args, base]);",
    "  } else {",
    '    const args = ["diff", "--no-renames", "--name-only"];',
    "    runGit([...args, base]);",
    "  }",
    "}",
  ].join("\n");

  assert.deepEqual(linesOf(source), [4]);
});

test("resolves a constant to the loop that declares it, not to another loop beside it", () => {
  const source = [
    "function list(base) {",
    '  for (const args = ["diff", "--name-only"]; ; ) {',
    "    runGit([...args, base]);",
    "    break;",
    "  }",
    '  for (const args = ["diff", "--no-renames", "--name-only"]; ; ) {',
    "    runGit([...args, base]);",
    "    break;",
    "  }",
    "}",
  ].join("\n");

  assert.deepEqual(linesOf(source), [3]);
});

for (const loop of ["of", "in"]) {
  test(`does not take a for-${loop} loop variable for a constant of the same name declared after the loop`, () => {
    const source = [
      "function list(lists) {",
      `  for (const args ${loop} lists) runGit(["diff", "--name-only", ...args]);`,
      '  const args = ["--no-renames"];',
      "}",
    ].join("\n");

    assert.deepEqual(linesOf(source), [2]);
  });
}

test("resolves a constant to the switch that declares it, not to another switch beside it", () => {
  const source = [
    "function list(kind, base) {",
    "  switch (kind) {",
    '    case "names":',
    '      const args = ["diff", "--name-only"];',
    "      runGit([...args, base]);",
    "  }",
    "  switch (kind) {",
    '    case "names":',
    '      const args = ["diff", "--no-renames", "--name-only"];',
    "      runGit([...args, base]);",
    "  }",
    "}",
  ].join("\n");

  assert.deepEqual(linesOf(source), [5]);
});

test("does not take a caught error for a constant of the same name declared after the try", () => {
  const source = [
    "function list() {",
    "  try {",
    "    work();",
    "  } catch (args) {",
    '    runGit(["diff", "--name-only", ...args]);',
    "  }",
    '  const args = ["--no-renames"];',
    "}",
  ].join("\n");

  assert.deepEqual(linesOf(source), [5]);
});

test("does not take a parameter for the constant its name shadows", () => {
  const source = [
    'const args = ["--no-renames"];',
    'const list = (args) => runGit(["diff", "--name-only", ...args]);',
  ].join("\n");

  assert.deepEqual(linesOf(source), [2]);
});

test("finds a listing that concatenates onto an array it cannot follow", () => {
  const source =
    'const list = (globalArgs) => runGit(globalArgs.concat(["diff", "--name-only", base]));\n';

  assert.deepEqual(linesOf(source), [1]);
});

test("accepts a string concatenated with a listing's words", () => {
  const source = 'const label = "Listing: ".concat(["diff", "--name-only"]);\n';

  assert.deepEqual(linesOf(source), []);
});

const COMMIT_DIFF_ARGS_MODULE = 'export const COMMIT_DIFF_ARGS = ["show", "--format="];\n';

for (const [route, spread, files] of [
  [
    "a named import",
    "COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import { COMMIT_DIFF_ARGS } from "./commit-diff-args.mjs";',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "a renamed import",
    "SHOW",
    {
      "script.mjs": 'import { COMMIT_DIFF_ARGS as SHOW } from "./commit-diff-args.mjs";',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "a namespace import",
    "diffArgs.COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import * as diffArgs from "./commit-diff-args.mjs";',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "a re-export by name",
    "COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import { COMMIT_DIFF_ARGS } from "./git/args.mjs";',
      "git/args.mjs": 'export { COMMIT_DIFF_ARGS } from "../commit-diff-args.mjs";\n',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "a re-export of a whole module",
    "COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import { COMMIT_DIFF_ARGS } from "./git/args.mjs";',
      "git/args.mjs": 'export * from "../commit-diff-args.mjs";\n',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "a default import",
    "SHOW",
    {
      "script.mjs": 'import SHOW from "./commit-diff-args.mjs";',
      "commit-diff-args.mjs": 'export default ["show", "--format="];\n',
    },
  ],
  [
    "a namespace re-export",
    "git.COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import { git } from "./git.mjs";',
      "git.mjs": 'export * as git from "./commit-diff-args.mjs";\n',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "a renamed import of a namespace re-export",
    "diffArgs.COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import { git as diffArgs } from "./git.mjs";',
      "git.mjs": 'export * as git from "./commit-diff-args.mjs";\n',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "a namespace re-exported by name",
    "git.COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import { git } from "./index.mjs";',
      "index.mjs": 'export { git } from "./git.mjs";\n',
      "git.mjs": 'export * as git from "./commit-diff-args.mjs";\n',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "an export list naming a namespace import",
    "git.COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import { git } from "./git.mjs";',
      "git.mjs": 'import * as args from "./commit-diff-args.mjs";\nexport { args as git };\n',
      "commit-diff-args.mjs": COMMIT_DIFF_ARGS_MODULE,
    },
  ],
  [
    "an export list renaming a local constant",
    "COMMIT_DIFF_ARGS",
    {
      "script.mjs": 'import { COMMIT_DIFF_ARGS } from "./commit-diff-args.mjs";',
      "commit-diff-args.mjs":
        'const SHOW = ["show", "--format="];\nexport { SHOW as COMMIT_DIFF_ARGS };\n',
    },
  ],
]) {
  test(`finds a listing that spreads its subcommand from a constant reached through ${route}`, () => {
    const scripts = Object.fromEntries(
      Object.entries({
        ...files,
        "script.mjs": `${files["script.mjs"]}\nrunGit([...${spread}, "--name-only", commit]);\n`,
      }).map(([path, source]) => [`.github/scripts/${path}`, source]),
    );

    const violations = checkFiles([".github/scripts/script.mjs"], (path) => scripts[path]);

    assert.deepEqual(
      violations.map(({ path, line }) => `${path}:${line}`),
      [".github/scripts/script.mjs:2"],
    );
  });
}

test("accepts a listing whose --no-renames comes from an imported constant", () => {
  const scripts = {
    "script.mjs": [
      'import { COMMIT_DIFF_ARGS } from "./commit-diff-args.mjs";',
      'runGit([...COMMIT_DIFF_ARGS, "--name-only", commit]);',
    ].join("\n"),
    "commit-diff-args.mjs": 'export const COMMIT_DIFF_ARGS = ["show", "--no-renames"];\n',
  };

  assert.deepEqual(
    checkFiles(["script.mjs"], (path) => scripts[path]),
    [],
  );
});

test("finds a git command string run through execSync", () => {
  const source = [
    'execSync("git diff --name-only origin/main...HEAD");',
    `execSync(\`git log --name-status \${base}..HEAD\`);`,
    'execSync("git show --no-renames --name-only " + sha);',
  ].join("\n");

  assert.deepEqual(linesOf(source), [1, 2]);
});

test("finds a git command string kept in a constant or built from several parts", () => {
  const source = [
    'const LIST = "git diff --name-only";',
    `execSync(\`\${LIST} \${base}\`);`,
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
    "a.mjs": ['import x from "y";', "runGit([", '  "diff",', '  "--name-only",', "]);"].join("\n"),
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
