import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findPnpmSetupSteps,
  findWorkflowFiles,
} from "./pnpm-setup-skips-npm-audit.mjs";

test("flags a pnpm/action-setup step with no env", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: pnpm/action-setup@SHA1"].join(
    "\n",
  );

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].line, 4);
  assert.equal(steps[0].skipsNpmAudit, false);
});

test("accepts a step env that sets npm_config_audit to the boolean false", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    "          npm_config_audit: false",
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, true);
});

test('accepts a step env that sets npm_config_audit to the string "false"', () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "false"',
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, true);
});

test('flags npm_config_audit set to "true"', () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "true"',
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, false);
});

test("flags an env that sets only other variables", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    "          CI: true",
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, false);
});

test("accepts the upper-case NPM_CONFIG_AUDIT key", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          NPM_CONFIG_AUDIT: "false"',
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, true);
});

test("flags a step that sets the key in two cases when one of them is not false", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "false"',
    '          NPM_CONFIG_AUDIT: "true"',
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, false);
});

test("accepts npm_config_audit set at job level", () => {
  const source = [
    "jobs:",
    "  build:",
    "    env:",
    '      npm_config_audit: "false"',
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, true);
});

test("accepts npm_config_audit set at workflow level", () => {
  const source = [
    "env:",
    '  npm_config_audit: "false"',
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, true);
});

test("flags a step-level true that overrides a workflow-level false", () => {
  const source = [
    "env:",
    '  npm_config_audit: "false"',
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "true"',
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, false);
});

test("flags a job-level true that overrides a workflow-level false", () => {
  const source = [
    "env:",
    '  npm_config_audit: "false"',
    "jobs:",
    "  build:",
    "    env:",
    '      npm_config_audit: "true"',
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, false);
});

test("accepts a step-level false that overrides a workflow-level true", () => {
  const source = [
    "env:",
    '  npm_config_audit: "true"',
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "false"',
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, true);
});

test("does not accept npm_config_audit set under with: instead of env:", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        with:",
    "          npm_config_audit: false",
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, false);
});

test("flags an expression value, which cannot be known to be false", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "${{ vars.NPM_AUDIT }}"',
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, false);
});

test("ignores steps that use another action", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: actions/setup-node@SHA1"].join(
    "\n",
  );

  assert.deepEqual(findPnpmSetupSteps(source), []);
});

test("ignores a pnpm/action-setup mentioned in a comment", () => {
  const source = ["jobs:", "  build:", "    steps:", "      # - uses: pnpm/action-setup@SHA1"].join(
    "\n",
  );

  assert.deepEqual(findPnpmSetupSteps(source), []);
});

test("ignores npm_config_audit mentioned in a comment", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          # npm_config_audit: "false"',
    "          CI: true",
  ].join("\n");

  assert.equal(findPnpmSetupSteps(source)[0].skipsNpmAudit, false);
});

test("finds a pnpm/action-setup step written as a named step", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - name: Setup pnpm",
    "        uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "false"',
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].line, 4);
  assert.equal(steps[0].skipsNpmAudit, true);
});

test("recognizes a pnpm/action-setup step whose uses: value is quoted", () => {
  const source = ["jobs:", "  build:", "    steps:", '      - uses: "pnpm/action-setup@SHA1"'].join(
    "\n",
  );

  assert.equal(findPnpmSetupSteps(source).length, 1);
});

test("recognizes a pnpm/action-setup step written as a flow mapping", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    '      - { uses: pnpm/action-setup@SHA1, env: { npm_config_audit: "false" } }',
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].skipsNpmAudit, true);
});

test("recognizes pnpm/action-setup regardless of owner/repo casing", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - uses: PNPM/Action-Setup@SHA1"].join(
    "\n",
  );

  assert.equal(findPnpmSetupSteps(source).length, 1);
});

test("finds every step across two jobs, each reported at its own line", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "false"',
    "  deploy:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 2);
  assert.equal(steps[0].line, 4);
  assert.equal(steps[0].skipsNpmAudit, true);
  assert.equal(steps[1].line, 9);
  assert.equal(steps[1].skipsNpmAudit, false);
});

test("does not let one job's env reach the next job's step", () => {
  const source = [
    "jobs:",
    "  build:",
    "    env:",
    '      npm_config_audit: "false"',
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "  deploy:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps[0].skipsNpmAudit, true);
  assert.equal(steps[1].skipsNpmAudit, false);
});

test("resolves a jobs: value that is itself an alias", () => {
  const source = [
    "x-jobs: &all-jobs",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "jobs: *all-jobs",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].skipsNpmAudit, false);
});

test("resolves a job that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build: &common-job",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "false"',
    "  deploy: *common-job",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.skipsNpmAudit));
});

test("resolves a steps: value that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps: &common-steps",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "false"',
    "  deploy:",
    "    steps: *common-steps",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.skipsNpmAudit));
});

test("resolves a step in a steps: sequence that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - &setup-step",
    "        uses: pnpm/action-setup@SHA1",
    "      - *setup-step",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.skipsNpmAudit === false));
});

test("resolves a uses: value that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: &setup-action pnpm/action-setup@SHA1",
    "        env:",
    '          npm_config_audit: "false"',
    "  deploy:",
    "    steps:",
    "      - uses: *setup-action",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 2);
  assert.equal(steps[0].skipsNpmAudit, true);
  assert.equal(steps[1].skipsNpmAudit, false);
});

test("resolves an env: map that is itself an alias, at every level", () => {
  const source = [
    "x-env: &no-audit",
    '  npm_config_audit: "false"',
    "env: *no-audit",
    "jobs:",
    "  build:",
    "    env: *no-audit",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "  deploy:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env: *no-audit",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.skipsNpmAudit));
});

test("resolves an npm_config_audit value that is itself an alias", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    "          npm_config_audit: &skip-audit false",
    "      - uses: pnpm/action-setup@SHA1",
    "        env:",
    "          npm_config_audit: *skip-audit",
  ].join("\n");

  const steps = findPnpmSetupSteps(source);

  assert.equal(steps.length, 2);
  assert.ok(steps.every((step) => step.skipsNpmAudit));
});

test("findWorkflowFiles also finds a .yaml workflow file", () => {
  const root = mkdtempSync(join(tmpdir(), "pnpm-setup-skips-npm-audit-"));
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

test("reports the file and line of every step that does not turn off npm's audit", () => {
  const files = {
    "a.yml": ["jobs:", "  build:", "    steps:", "      - uses: pnpm/action-setup@SHA1"].join("\n"),
    "b.yml": [
      "jobs:",
      "  build:",
      "    steps:",
      "      - uses: pnpm/action-setup@SHA1",
      "        env:",
      '          npm_config_audit: "false"',
    ].join("\n"),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "a.yml");
  assert.equal(violations[0].line, 4);
  assert.equal(
    violations[0].message,
    'pnpm/action-setup step does not set npm_config_audit: "false" in its env',
  );
});

test("reports a workflow that does not parse as YAML instead of scanning it silently", () => {
  const files = {
    "broken.yml": ["jobs:", "  build:", "    steps:", '      - uses: "pnpm/action-setup@SHA1'].join(
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
  const description = describeViolation({
    path: "a.yml",
    line: 2,
    message: 'pnpm/action-setup step does not set npm_config_audit: "false" in its env',
  });

  assert.equal(
    description,
    'a.yml:2: pnpm/action-setup step does not set npm_config_audit: "false" in its env',
  );
});

test("every pnpm/action-setup step in every workflow sets npm_config_audit to false", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "pnpm/action-setup installs its bootstrap pnpm with npm ci, and npm's audit request inside " +
      "that install can hang for minutes and time out the job; set npm_config_audit: \"false\" " +
      "in the env of the step, its job or the workflow.",
  );
});
