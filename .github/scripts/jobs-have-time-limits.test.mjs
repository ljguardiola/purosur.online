import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFiles, describeViolation, findWorkflowFiles } from "./jobs-have-time-limits.mjs";

function check(source) {
  return checkFiles(["a.yml"], () => source);
}

test("flags a job with no timeout-minutes, at the line of its key", () => {
  const source = [
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - run: true",
  ].join("\n");

  assert.deepEqual(check(source), [
    { path: "a.yml", line: 2, message: "job build has no timeout-minutes" },
  ]);
});

test("accepts a job with a positive timeout-minutes", () => {
  const source = ["jobs:", "  build:", "    timeout-minutes: 5", "    runs-on: ubuntu-24.04"].join(
    "\n",
  );

  assert.deepEqual(check(source), []);
});

test("does not count a step's timeout-minutes as the job's", () => {
  const source = [
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - run: true",
    "        timeout-minutes: 5",
  ].join("\n");

  assert.equal(check(source).length, 1);
});

test("flags a timeout-minutes that is zero, negative or not a number", () => {
  for (const value of ["0", "-5", '"5"', "five", ""]) {
    const source = ["jobs:", "  build:", `    timeout-minutes: ${value}`].join("\n");

    assert.equal(check(source).length, 1, `timeout-minutes: ${value}`);
  }
});

test("reports only the jobs missing a time limit among several", () => {
  const source = [
    "jobs:",
    "  build:",
    "    timeout-minutes: 5",
    "  test:",
    "    runs-on: ubuntu-24.04",
    "  deploy:",
    "    timeout-minutes: 5",
  ].join("\n");

  assert.deepEqual(
    check(source).map((violation) => violation.line),
    [4],
  );
});

test("does not flag a job that calls a reusable workflow, which cannot set timeout-minutes", () => {
  const source = ["jobs:", "  release:", "    uses: ./.github/workflows/release.yml"].join("\n");

  assert.deepEqual(check(source), []);
});

test("resolves a job that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build: &common-job",
    "    timeout-minutes: 5",
    "  deploy: *common-job",
  ].join("\n");

  assert.deepEqual(check(source), []);
});

test("resolves a jobs: value that is itself an alias", () => {
  const source = [
    "x-jobs: &all-jobs",
    "  build:",
    "    runs-on: ubuntu-24.04",
    "jobs: *all-jobs",
  ].join("\n");

  assert.equal(check(source).length, 1);
});

test("resolves a timeout-minutes value that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    timeout-minutes: &short-limit 5",
    "  deploy:",
    "    timeout-minutes: *short-limit",
  ].join("\n");

  assert.deepEqual(check(source), []);
});

test("describes a violation with its file, line and message", () => {
  assert.equal(
    describeViolation({ path: "a.yml", line: 2, message: "job build has no timeout-minutes" }),
    "a.yml:2: job build has no timeout-minutes",
  );
});

test("reports a workflow that does not parse as YAML instead of passing it silently", () => {
  const source = ["jobs:", "  build:", '    runs-on: "ubuntu-24.04'].join("\n");

  const violations = check(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /does not parse as YAML/);
});

test("every job in every workflow has a time limit", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "a job with no timeout-minutes that gets stuck keeps its runner busy for GitHub's " +
      "six-hour default; set timeout-minutes a little above the job's normal duration.",
  );
});
