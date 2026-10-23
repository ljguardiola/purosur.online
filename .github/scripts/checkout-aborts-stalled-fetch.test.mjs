import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findCheckoutSteps,
  findWorkflowFiles,
} from "./checkout-aborts-stalled-fetch.mjs";

test("flags an actions/checkout step with no env", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: actions/checkout@SHA1"].join(
    "\n",
  );

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].line, 4);
  assert.equal(steps[0].abortsStalledFetch, false);
});

test("accepts a step env that sets both low-speed variables", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    '          GIT_HTTP_LOW_SPEED_TIME: "30"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, true);
});

test("accepts the low-speed variables written as numbers", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    "          GIT_HTTP_LOW_SPEED_LIMIT: 1000",
    "          GIT_HTTP_LOW_SPEED_TIME: 30",
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, true);
});

test("flags a step that sets only the speed limit", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("flags a step that sets only the time", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          GIT_HTTP_LOW_SPEED_TIME: "30"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("flags a zero speed limit, which git reads as no limit", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          GIT_HTTP_LOW_SPEED_LIMIT: "0"',
    '          GIT_HTTP_LOW_SPEED_TIME: "30"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("flags a zero time", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    '          GIT_HTTP_LOW_SPEED_TIME: "0"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("flags a value that is not a whole number", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          GIT_HTTP_LOW_SPEED_LIMIT: "1k"',
    '          GIT_HTTP_LOW_SPEED_TIME: "30"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("flags the variables written in another case, which git does not read", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          git_http_low_speed_limit: "1000"',
    '          git_http_low_speed_time: "30"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("accepts the variables set at job level", () => {
  const source = [
    "jobs:",
    "  build:",
    "    env:",
    '      GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    '      GIT_HTTP_LOW_SPEED_TIME: "30"',
    "    steps:",
    "      - uses: actions/checkout@SHA1",
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, true);
});

test("accepts the variables set at workflow level", () => {
  const source = [
    "env:",
    '  GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    '  GIT_HTTP_LOW_SPEED_TIME: "30"',
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, true);
});

test("accepts the two variables set at different levels", () => {
  const source = [
    "env:",
    '  GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          GIT_HTTP_LOW_SPEED_TIME: "30"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, true);
});

test("flags a step-level zero that overrides a workflow-level limit", () => {
  const source = [
    "env:",
    '  GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    '  GIT_HTTP_LOW_SPEED_TIME: "30"',
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    '          GIT_HTTP_LOW_SPEED_LIMIT: "0"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("flags a job-level zero that overrides a workflow-level time", () => {
  const source = [
    "env:",
    '  GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    '  GIT_HTTP_LOW_SPEED_TIME: "30"',
    "jobs:",
    "  build:",
    "    env:",
    '      GIT_HTTP_LOW_SPEED_TIME: "0"',
    "    steps:",
    "      - uses: actions/checkout@SHA1",
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("does not accept the variables set under with: instead of env:", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    '          GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    '          GIT_HTTP_LOW_SPEED_TIME: "30"',
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, false);
});

test("ignores steps that use another action", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: actions/setup-node@SHA1"].join(
    "\n",
  );

  assert.deepEqual(findCheckoutSteps(source), []);
});

test("ignores an actions/checkout mentioned in a comment", () => {
  const source = ["jobs:", "  build:", "    steps:", "      # - uses: actions/checkout@SHA1"].join(
    "\n",
  );

  assert.deepEqual(findCheckoutSteps(source), []);
});

test("finds an actions/checkout step written as a named step", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - name: Check out",
    "        uses: actions/checkout@SHA1",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].line, 4);
});

test("recognizes an actions/checkout step whose uses: value is quoted", () => {
  const source = ["jobs:", "  build:", "    steps:", '      - uses: "actions/checkout@SHA1"'].join(
    "\n",
  );

  assert.equal(findCheckoutSteps(source).length, 1);
});

test("recognizes an actions/checkout step written as a flow mapping", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - { uses: actions/checkout@SHA1, env: { GIT_HTTP_LOW_SPEED_LIMIT: 1000, GIT_HTTP_LOW_SPEED_TIME: 30 } }",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].abortsStalledFetch, true);
});

test("recognizes actions/checkout regardless of owner/repo casing", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: Actions/Checkout@SHA1"].join(
    "\n",
  );

  assert.equal(findCheckoutSteps(source).length, 1);
});

test("does not let one job's env reach the next job's step", () => {
  const source = [
    "jobs:",
    "  build:",
    "    env:",
    '      GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
    '      GIT_HTTP_LOW_SPEED_TIME: "30"',
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "  deploy:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.equal(steps[0].abortsStalledFetch, true);
  assert.equal(steps[1].line, 10);
  assert.equal(steps[1].abortsStalledFetch, false);
});

test("resolves jobs, a job, steps, a step and uses: written as aliases", () => {
  const source = [
    "x-steps: &common-steps",
    "  - &checkout-step",
    "    uses: &checkout-action actions/checkout@SHA1",
    "  - *checkout-step",
    "  - uses: *checkout-action",
    "x-jobs: &all-jobs",
    "  build: &common-job",
    "    steps: *common-steps",
    "  deploy: *common-job",
    "jobs: *all-jobs",
  ].join("\n");

  assert.equal(findCheckoutSteps(source).length, 6);
});

test("resolves an env: map and its values written as aliases", () => {
  const source = [
    "x-env: &low-speed",
    "  GIT_HTTP_LOW_SPEED_LIMIT: &limit 1000",
    "  GIT_HTTP_LOW_SPEED_TIME: 30",
    "env: *low-speed",
    "jobs:",
    "  build:",
    "    env:",
    "      GIT_HTTP_LOW_SPEED_LIMIT: *limit",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
  ].join("\n");

  assert.equal(findCheckoutSteps(source)[0].abortsStalledFetch, true);
});

test("findWorkflowFiles also finds a .yaml workflow file", () => {
  const root = mkdtempSync(join(tmpdir(), "checkout-aborts-stalled-fetch-"));
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "a.yml"), "jobs: {}\n");
    writeFileSync(join(root, ".github", "workflows", "b.yaml"), "jobs: {}\n");

    const files = findWorkflowFiles(root);

    assert.deepEqual(files, [
      join(".github", "workflows", "a.yml"),
      join(".github", "workflows", "b.yaml"),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports the file and line of every checkout step that does not abort a stalled fetch", () => {
  const files = {
    "a.yml": ["jobs:", "  build:", "    steps:", "      - uses: actions/checkout@SHA1"].join("\n"),
    "b.yml": [
      "env:",
      '  GIT_HTTP_LOW_SPEED_LIMIT: "1000"',
      '  GIT_HTTP_LOW_SPEED_TIME: "30"',
      "jobs:",
      "  build:",
      "    steps:",
      "      - uses: actions/checkout@SHA1",
    ].join("\n"),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "a.yml");
  assert.equal(violations[0].line, 4);
  assert.equal(
    violations[0].message,
    "actions/checkout step does not set GIT_HTTP_LOW_SPEED_LIMIT and GIT_HTTP_LOW_SPEED_TIME to positive whole numbers in its env",
  );
});

test("reports a workflow that does not parse as YAML instead of scanning it silently", () => {
  const files = {
    "broken.yml": ["jobs:", "  build:", "    steps:", '      - uses: "actions/checkout@SHA1'].join(
      "\n",
    ),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "broken.yml");
  assert.equal(violations[0].line, 4);
  assert.match(violations[0].message, /does not parse as YAML/);
});

test("describes a violation with its file, line and message", () => {
  assert.equal(
    describeViolation({ path: "a.yml", line: 2, message: "some message" }),
    "a.yml:2: some message",
  );
});

test("every actions/checkout step in every workflow aborts a stalled fetch", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "actions/checkout retries a fetch that fails but waits forever on one that stalls, which can " +
      "use up the job's timeout; set GIT_HTTP_LOW_SPEED_LIMIT and GIT_HTTP_LOW_SPEED_TIME in the " +
      "env of the step, its job or the workflow so git aborts the stalled fetch and checkout retries it.",
  );
});
