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
} from "./checkout-drops-credentials.mjs";

// findCheckoutSteps -----------------------------------------------------------------------

test("flags a checkout step with no persist-credentials setting", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: actions/checkout@SHA1"].join(
    "\n",
  );

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].line, 4);
  assert.equal(steps[0].persistsCredentialsFalse, false);
});

test("accepts a checkout step that sets persist-credentials: false", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: false",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].persistsCredentialsFalse, true);
});

test("flags a checkout step that sets persist-credentials: true", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: true",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps[0].persistsCredentialsFalse, false);
});

test("flags a checkout step that keeps other with: options but not persist-credentials", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          fetch-depth: 0",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps[0].persistsCredentialsFalse, false);
});

test("ignores steps that use another action", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: actions/setup-node@SHA1"].join(
    "\n",
  );

  assert.deepEqual(findCheckoutSteps(source), []);
});

test("finds a checkout step written as a named step, with uses: on its own line", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: false",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].line, 4);
  assert.equal(steps[0].persistsCredentialsFalse, true);
});

test("finds every checkout step across two jobs, each reported at its own line", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: false",
    "  deploy:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.equal(steps[0].line, 4);
  assert.equal(steps[0].persistsCredentialsFalse, true);
  assert.equal(steps[1].line, 9);
  assert.equal(steps[1].persistsCredentialsFalse, false);
});

test("finds two adjacent checkout steps without mixing up their settings", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: false",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          ref: main",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.equal(steps[0].persistsCredentialsFalse, true);
  assert.equal(steps[1].persistsCredentialsFalse, false);
});

test("ignores a checkout mentioned in a comment", () => {
  const source = ["jobs:", "  build:", "    steps:", "      # - uses: actions/checkout@SHA1"].join(
    "\n",
  );

  assert.deepEqual(findCheckoutSteps(source), []);
});

test("ignores persist-credentials mentioned in a comment", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          # persist-credentials: false",
    "          fetch-depth: 0",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps[0].persistsCredentialsFalse, false);
});

test("does not let one job's steps leak into the next job's step block", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "  deploy:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: false",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.equal(steps[0].persistsCredentialsFalse, false);
  assert.equal(steps[1].persistsCredentialsFalse, true);
});

// Non-standard but valid YAML step shapes -------------------------------------------------

test("finds a checkout step whose steps: sequence is at the same indentation as the steps: key", () => {
  const source = ["jobs:", "  build:", "    steps:", "    - uses: actions/checkout@SHA1"].join(
    "\n",
  );

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].persistsCredentialsFalse, false);
});

test("recognizes a checkout step whose uses: value is quoted", () => {
  const source = ["jobs:", "  build:", "    steps:", '      - uses: "actions/checkout@SHA1"'].join(
    "\n",
  );

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
});

test("recognizes a checkout step written as a flow mapping", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - { uses: actions/checkout@SHA1 }",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
});

test("recognizes actions/checkout regardless of owner/repo casing", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: Actions/Checkout@SHA1"].join(
    "\n",
  );

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
});

test("does not accept persist-credentials: false set under env: instead of with:", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        env:",
    "          persist-credentials: false",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps[0].persistsCredentialsFalse, false);
});

test('accepts persist-credentials: "false" as a quoted string', () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    '          persist-credentials: "false"',
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps[0].persistsCredentialsFalse, true);
});

// YAML alias resolution --------------------------------------------------------------------

test("resolves a jobs: value that is itself an alias", () => {
  const source = [
    "x-jobs: &all-jobs",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "jobs: *all-jobs",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].persistsCredentialsFalse, false);
});

test("resolves a job that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build: &common-job",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: false",
    "  deploy: *common-job",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.persistsCredentialsFalse));
});

test("resolves a steps: value that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps: &common-steps",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: false",
    "  deploy:",
    "    steps: *common-steps",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.persistsCredentialsFalse));
});

test("resolves a step in a steps: sequence that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - &checkout-step",
    "        uses: actions/checkout@SHA1",
    "      - *checkout-step",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.persistsCredentialsFalse === false));
});

test("resolves a uses: value that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: &checkout-action actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: false",
    "  deploy:",
    "    steps:",
    "      - uses: *checkout-action",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.equal(steps[0].persistsCredentialsFalse, true);
  assert.equal(steps[1].persistsCredentialsFalse, false);
});

test("resolves a with: value that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with: &safe-options",
    "          persist-credentials: false",
    "      - uses: actions/checkout@SHA1",
    "        with: *safe-options",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.persistsCredentialsFalse));
});

test("resolves a persist-credentials: value that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: &drop-credentials false",
    "      - uses: actions/checkout@SHA1",
    "        with:",
    "          persist-credentials: *drop-credentials",
  ].join("\n");

  const steps = findCheckoutSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.persistsCredentialsFalse));
});

// findWorkflowFiles ---------------------------------------------------------------------------

test("findWorkflowFiles also finds a .yaml workflow file", () => {
  const root = mkdtempSync(join(tmpdir(), "checkout-drops-credentials-"));
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

// checkFiles --------------------------------------------------------------------------------

test("reports the file and line of every checkout step missing persist-credentials: false", () => {
  const files = {
    "a.yml": ["jobs:", "  build:", "    steps:", "      - uses: actions/checkout@SHA1"].join("\n"),
    "b.yml": [
      "jobs:",
      "  build:",
      "    steps:",
      "      - uses: actions/checkout@SHA1",
      "        with:",
      "          persist-credentials: false",
    ].join("\n"),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "a.yml");
  assert.equal(violations[0].line, 4);
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

// describeViolation ---------------------------------------------------------------------------

test("describes a violation with its file, line and message", () => {
  const description = describeViolation({
    path: "a.yml",
    line: 2,
    message: "actions/checkout step has no persist-credentials: false",
  });

  assert.equal(description, "a.yml:2: actions/checkout step has no persist-credentials: false");
});

// The guard itself: every actions/checkout step in every workflow in the repository, scanned for
// real. This is what fails `pnpm verify` (via `node --test .github/scripts/*.test.mjs`) when a job
// that runs pull request code would otherwise keep the workflow token in its git config.
test("every actions/checkout step in every workflow sets persist-credentials: false", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "a job that keeps the checkout token in its git config leaks it to any code the job runs " +
      "afterwards, including a fork's pull request code; set persist-credentials: false.",
  );
});
