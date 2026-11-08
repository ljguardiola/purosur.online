import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findDependencyCacheViolations,
  findWorkflowFiles,
} from "./dependency-cache-bounded.mjs";

const SETUP_NODE = "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0";
const CACHE_RESTORE = "actions/cache/restore@caa296126883cff596d87d8935842f9db880ef25 # v6.1.0";

function workflowWithSteps(...stepsLines) {
  return [
    "jobs:",
    "  tests:",
    "    runs-on: ubuntu-24.04",
    "    timeout-minutes: 10",
    "    steps:",
    ...stepsLines.flatMap((lines) =>
      lines.map((line, i) => (i === 0 ? `      - ${line}` : `        ${line}`)),
    ),
    "      - run: pnpm install --frozen-lockfile",
  ].join("\n");
}

const SETUP_NODE_WITHOUT_CACHE = [
  `uses: ${SETUP_NODE}`,
  "with:",
  "  node-version-file: .node-version",
];

const SETUP_NODE_WITH_PNPM_CACHE = [...SETUP_NODE_WITHOUT_CACHE, "  cache: pnpm"];

function cacheStep(uses, extraLines) {
  return [
    `uses: ${uses}`,
    ...extraLines,
    "with:",
    `  path: \${{ steps.pnpm-store.outputs.path }}`,
    `  key: pnpm-store-\${{ hashFiles('pnpm-lock.yaml') }}`,
  ];
}

function assertSingleViolation(violations, pattern) {
  assert.equal(violations.length, 1, violations.map((v) => v.message).join("\n"));
  assert.match(violations[0].message, pattern);
}

test("passes a job that sets up Node without a cache and restores the store in a bounded step that may fail", () => {
  const violations = findDependencyCacheViolations(
    workflowWithSteps(
      SETUP_NODE_WITHOUT_CACHE,
      cacheStep(CACHE_RESTORE, ["continue-on-error: true", "timeout-minutes: 2"]),
    ),
  );

  assert.deepEqual(violations, []);
});

test("flags actions/setup-node restoring the pnpm cache, which a stalled download keeps from finishing", () => {
  const violations = findDependencyCacheViolations(workflowWithSteps(SETUP_NODE_WITH_PNPM_CACHE));

  assertSingleViolation(
    violations,
    /^tests job restores a dependency cache inside actions\/setup-node/,
  );
  assert.equal(violations[0].line, 6);
});

for (const uses of [
  CACHE_RESTORE,
  "actions/cache@caa296126883cff596d87d8935842f9db880ef25 # v6.1.0",
  "actions/cache/save@caa296126883cff596d87d8935842f9db880ef25 # v6.1.0",
]) {
  const action = uses.split("@")[0];

  test(`flags a ${action} step with no time limit of its own`, () => {
    for (const timeoutLines of [[], ["timeout-minutes: 0"], ['timeout-minutes: "2"']]) {
      const violations = findDependencyCacheViolations(
        workflowWithSteps(
          SETUP_NODE_WITHOUT_CACHE,
          cacheStep(uses, ["continue-on-error: true", ...timeoutLines]),
        ),
      );

      assertSingleViolation(violations, /^tests job's .* step sets no timeout-minutes/);
    }
  });

  test(`flags a ${action} step whose failure fails the job`, () => {
    for (const continueLines of [[], ["continue-on-error: false"]]) {
      const violations = findDependencyCacheViolations(
        workflowWithSteps(
          SETUP_NODE_WITHOUT_CACHE,
          cacheStep(uses, [...continueLines, "timeout-minutes: 2"]),
        ),
      );

      assertSingleViolation(violations, /^tests job's .* step does not continue on error/);
    }
  });

  test(`flags a ${action} step whose time limit does not end before its job's`, () => {
    for (const stepMinutes of [10, 30]) {
      const violations = findDependencyCacheViolations(
        workflowWithSteps(
          SETUP_NODE_WITHOUT_CACHE,
          cacheStep(uses, ["continue-on-error: true", `timeout-minutes: ${stepMinutes}`]),
        ),
      );

      assertSingleViolation(
        violations,
        new RegExp(
          `^tests job's .* step's timeout-minutes \\(${stepMinutes}\\) is not shorter than the job's \\(10\\)`,
        ),
      );
    }
  });
}

test("passes a cache step with any time limit in a job that sets none", () => {
  const violations = findDependencyCacheViolations(
    workflowWithSteps(
      SETUP_NODE_WITHOUT_CACHE,
      cacheStep(CACHE_RESTORE, ["continue-on-error: true", "timeout-minutes: 30"]),
    ).replace("    timeout-minutes: 10\n", ""),
  );

  assert.deepEqual(violations, []);
});

test("reports each workflow's violations under its own path", () => {
  const files = {
    "a.yml": workflowWithSteps(SETUP_NODE_WITHOUT_CACHE),
    "b.yml": workflowWithSteps(SETUP_NODE_WITH_PNPM_CACHE),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "b.yml");
  assert.equal(violations[0].line, 6);
  assert.match(violations[0].message, /^tests job restores a dependency cache/);
});

test("reports a workflow that does not parse as YAML instead of scanning it silently", () => {
  const files = {
    "broken.yml": [
      "jobs:",
      "  build:",
      "    steps:",
      '      - uses: "actions/setup-node@SHA1',
    ].join("\n"),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "broken.yml");
  assert.match(violations[0].message, /does not parse as YAML/);
});

test("finds every workflow file, whichever YAML extension it uses", () => {
  const dir = mkdtempSync(join(tmpdir(), "dependency-cache-bounded-"));
  try {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    for (const file of ["b.yaml", "a.yml", "README.md"]) {
      writeFileSync(join(dir, ".github/workflows", file), "");
    }

    assert.deepEqual(findWorkflowFiles(dir), [
      ".github/workflows/a.yml",
      ".github/workflows/b.yaml",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("describes a violation with its file, line and message", () => {
  assert.equal(
    describeViolation({ path: "a.yml", line: 2, message: "some message" }),
    "a.yml:2: some message",
  );
});

test("every workflow restores its dependency caches in bounded steps that may fail", () => {
  const violations = checkFiles(findWorkflowFiles());

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "A cache download can stall and hang its step until the job times out; restore the pnpm " +
      "store with actions/cache/restore in its own step with timeout-minutes and " +
      "continue-on-error, as verify.yml does, instead of setup-node's cache.",
  );
});
