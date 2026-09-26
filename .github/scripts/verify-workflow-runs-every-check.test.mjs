import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkRepository,
  findVerifyWorkflowViolations,
} from "./verify-workflow-runs-every-check.mjs";

function workflow({ staticRun = "pnpm verify:static", shardValues = [1, 2, 3, 4], testsRun } = {}) {
  const shardLines = shardValues.map((value) => `          - ${value}`).join("\n");
  const testsRunLine =
    testsRun ?? `pnpm verify:tests --shard=\${{ matrix.shard }}/${shardValues.length}`;
  return [
    "jobs:",
    "  static:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    `      - run: ${staticRun}`,
    "  tests:",
    "    runs-on: ubuntu-24.04",
    "    strategy:",
    "      matrix:",
    "        shard:",
    shardLines,
    "    steps:",
    `      - run: ${testsRunLine}`,
  ].join("\n");
}

function packageJson(verifyScript = "pnpm verify:static && pnpm verify:tests") {
  return JSON.stringify({ scripts: { verify: verifyScript } });
}

// findVerifyWorkflowViolations --------------------------------------------------------------

test("passes when the static job runs verify:static, the shards cover 1..n, and verify composes both", () => {
  const violations = findVerifyWorkflowViolations(workflow(), packageJson());

  assert.deepEqual(violations, []);
});

test("flags a missing static job", () => {
  const source = [
    "jobs:",
    "  tests:",
    "    strategy:",
    "      matrix:",
    "        shard:",
    "          - 1",
    "          - 2",
    "    steps:",
    `      - run: pnpm verify:tests --shard=\${{ matrix.shard }}/2`,
  ].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 1);
  assert.match(violations[0], /static job/);
});

test("flags a static job that no longer runs verify:static", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ staticRun: "pnpm lint" }),
    packageJson(),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /verify:static/);
});

test("flags a missing tests job", () => {
  const source = ["jobs:", "  static:", "    steps:", "      - run: pnpm verify:static"].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 1);
  assert.match(violations[0], /tests job/);
});

test("flags shard values that skip a number", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({
      shardValues: [1, 2, 4],
      testsRun: `pnpm verify:tests --shard=\${{ matrix.shard }}/4`,
    }),
    packageJson(),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /matrix\.shard/);
});

test("flags shard values with a duplicate instead of covering every number once", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({
      shardValues: [1, 1, 2, 3],
      testsRun: `pnpm verify:tests --shard=\${{ matrix.shard }}/4`,
    }),
    packageJson(),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /matrix\.shard/);
});

test("flags a tests job whose run step does not divide by the shard count", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ testsRun: `pnpm verify:tests --shard=\${{ matrix.shard }}/2` }),
    packageJson(),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /verify:tests/);
});

test("flags a tests job that runs the wrong pnpm script", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ testsRun: `pnpm verify:static --shard=\${{ matrix.shard }}/4` }),
    packageJson(),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /verify:tests/);
});

test("flags a package.json verify script that no longer composes verify:static and verify:tests", () => {
  const violations = findVerifyWorkflowViolations(workflow(), packageJson("vitest run"));

  assert.equal(violations.length, 1);
  assert.match(violations[0], /"verify" script/);
});

test("reports a workflow that does not parse as YAML", () => {
  const source = ["jobs:", "  static:", "    steps:", '      - run: "unterminated'].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 1);
  assert.match(violations[0], /does not parse as YAML/);
});

// checkRepository ----------------------------------------------------------------------------

test("checkRepository reads the real workflow file and package.json path", () => {
  const files = {
    ".github/workflows/verify.yml": workflow(),
    "package.json": packageJson(),
  };

  const violations = checkRepository({ readFile: (path) => files[path] });

  assert.deepEqual(violations, []);
});

// The guard itself: the real workflow and package.json in this repository. This is what fails
// `pnpm verify` (via `node --test .github/scripts/*.test.mjs`, part of verify:static) if a future
// edit drops a check `pnpm verify` used to run.
test("the real Verify workflow runs every part of pnpm verify", () => {
  const violations = checkRepository();

  assert.deepEqual(violations, []);
});
