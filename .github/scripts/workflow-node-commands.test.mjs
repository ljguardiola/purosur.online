import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocument } from "yaml";
import {
  flagValue,
  insideRepository,
  nodeEntries,
  stepWorkingDirectory,
  WORKSPACE,
  wordPath,
} from "./workflow-node-commands.mjs";

function words(...texts) {
  return texts.map((text) => ({ text, unresolved: false }));
}

function workingDirectoryOf(lines) {
  const doc = parseDocument(lines.join("\n"));
  const job = doc.contents.get("jobs").get("build", true);
  const step = job.get("steps").items[0];
  return stepWorkingDirectory(doc, doc.contents, job, step);
}

function stepIn(directory) {
  return [
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: node s/main.mjs",
    `        working-directory: ${directory}`,
  ];
}

test("a step with no working directory anywhere runs at the repository root", () => {
  assert.equal(workingDirectoryOf(["jobs:", "  build:", "    steps:", "      - run: x"]), ".");
});

test("takes the step's working directory over the job's defaults, and the job's over the workflow's", () => {
  const workflowDefaults = ["defaults:", "  run:", "    working-directory: from-workflow"];
  const jobDefaults = ["    defaults:", "      run:", "        working-directory: from-job"];
  const steps = ["    steps:", "      - run: x"];

  assert.equal(
    workingDirectoryOf([...workflowDefaults, "jobs:", "  build:", ...jobDefaults, ...steps]),
    "from-job",
  );
  assert.equal(
    workingDirectoryOf([...workflowDefaults, "jobs:", "  build:", ...steps]),
    "from-workflow",
  );
  assert.equal(
    workingDirectoryOf([
      ...workflowDefaults,
      "jobs:",
      "  build:",
      ...jobDefaults,
      ...steps,
      "        working-directory: from-step",
    ]),
    "from-step",
  );
});

test("reads a working directory reached through an alias", () => {
  assert.equal(
    workingDirectoryOf([
      "x-dir: &dir apps/x",
      "jobs:",
      "  build:",
      "    steps:",
      "      - run: x",
      "        working-directory: *dir",
    ]),
    "apps/x",
  );
});

test("reads a working directory given from the workspace as a repository path", () => {
  for (const directory of [
    `\${{ github.workspace }}/apps/x`,
    `\${{github.workspace}}/apps/x`,
    `\${GITHUB_WORKSPACE}/apps/x`,
    "$GITHUB_WORKSPACE/apps/x",
    "./apps/x",
  ]) {
    assert.equal(workingDirectoryOf(stepIn(directory)), "apps/x", directory);
  }
});

test("cannot resolve a working directory outside the repository or known only while the job runs", () => {
  for (const directory of [
    "..",
    "apps/../../x",
    "/tmp/x",
    `\${{ runner.temp }}/x`,
    "$HOME/x",
    "$GITHUB_WORKSPACE_OTHER/x",
  ]) {
    assert.equal(workingDirectoryOf(stepIn(directory)), undefined, directory);
  }
});

test("joins a relative path to its directory as a repository path", () => {
  assert.equal(insideRepository("apps/x", "s/main.mjs"), "apps/x/s/main.mjs");
  assert.equal(insideRepository("apps/x", "../../s/main.mjs"), "s/main.mjs");
  assert.equal(insideRepository(".", "./s/../t/main.mjs"), "t/main.mjs");
  assert.equal(insideRepository(".", "..s/main.mjs"), "..s/main.mjs");
});

test("answers no repository path for a path that leaves the repository or is absolute", () => {
  assert.equal(insideRepository("apps", "../.."), undefined);
  assert.equal(insideRepository("apps", "../../s/main.mjs"), undefined);
  assert.equal(insideRepository(".", "/s/main.mjs"), undefined);
});

test("takes a flag's value from after its equals sign, or else from the next word", () => {
  const args = words("--import", "./hook.mjs", "s/main.mjs");

  assert.deepEqual(flagValue(args, 0, undefined), { value: args[1], next: 1 });
  assert.deepEqual(flagValue(words("--import=./hook.mjs"), 0, "./hook.mjs"), {
    value: { text: "./hook.mjs", unresolved: false },
    next: 0,
  });
});

test("finds the script node runs after flags with and without values", () => {
  for (const args of [
    words("s/main.mjs", "--flag"),
    words("--experimental-strip-types", "s/main.mjs"),
    words("--max-old-space-size=4096", "--no-warnings", "s/main.mjs", "arg"),
    words("--disable-warning", "ExperimentalWarning", "s/main.mjs"),
    words("--env-file=.env", "--title", "x", "s/main.mjs"),
    words("--", "s/main.mjs"),
  ]) {
    assert.deepEqual(
      nodeEntries(args),
      [{ kind: "script", word: { text: "s/main.mjs", unresolved: false } }],
      args.map((word) => word.text).join(" "),
    );
  }
  assert.deepEqual(nodeEntries(words("--", "--main.mjs")), [
    { kind: "script", word: { text: "--main.mjs", unresolved: false } },
  ]);
});

test("finds the modules node preloads before its script", () => {
  const args = words("--import", "./hook.mjs", "-r=./other.cjs", "--title", "x", "s/main.mjs");

  assert.deepEqual(nodeEntries(args), [
    { kind: "preload", word: args[1], label: "node --import ./hook.mjs" },
    { kind: "preload", word: { ...args[2], text: "./other.cjs" }, label: "node -r ./other.cjs" },
    { kind: "script", word: args[5] },
  ]);
});

test("finds the test files node --test runs, or that it finds them by itself", () => {
  assert.deepEqual(
    nodeEntries(words("--test", "--test-reporter", "spec", "a.test.mjs", "b/*.mjs")),
    [
      { kind: "test-file", word: { text: "a.test.mjs", unresolved: false } },
      { kind: "test-file", word: { text: "b/*.mjs", unresolved: false } },
    ],
  );
  assert.deepEqual(nodeEntries(words("--test")), [{ kind: "default-tests" }]);
});

test("finds the code node evaluates instead of a script", () => {
  for (const flag of ["-e", "--eval", "-p", "--print"]) {
    assert.deepEqual(nodeEntries(words(flag, "import('x')", "s/main.mjs")), [
      { kind: "code", code: "import('x')", label: `node ${flag} code` },
    ]);
  }
  assert.deepEqual(nodeEntries(words("--eval=1")), [
    { kind: "code", code: "1", label: "node --eval code" },
  ]);
});

test("finds nothing for node commands that run no script", () => {
  for (const args of [
    words(),
    words("--version"),
    words("-v"),
    words("--help", "s/main.mjs"),
    words("--v8-options"),
    words("-"),
    words("-", "s/main.mjs"),
    words("--no-warnings", "-"),
    words("--"),
  ]) {
    assert.deepEqual(nodeEntries(args), [], args.map((word) => word.text).join(" "));
  }
});

test("resolves a word against its working directory, or from the repository root when it starts at the workspace", () => {
  assert.equal(wordPath(words("s/main.mjs")[0], "apps/x"), "apps/x/s/main.mjs");
  assert.equal(wordPath(words(`${WORKSPACE}/s/main.mjs`)[0], "apps/x"), "s/main.mjs");
});

test("cannot resolve a word not known until the job runs, run from an unknown directory, or leaving the repository", () => {
  assert.equal(wordPath({ text: "s/main.mjs", unresolved: true }, "."), undefined);
  assert.equal(wordPath(words("s/main.mjs")[0], undefined), undefined);
  assert.equal(wordPath(words("../s/main.mjs")[0], "."), undefined);
  assert.equal(wordPath(words(`${WORKSPACE}/../s/main.mjs`)[0], "."), undefined);
});
