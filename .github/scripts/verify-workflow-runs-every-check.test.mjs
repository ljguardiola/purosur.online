import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkRepository,
  findVerifyWorkflowViolations,
} from "./verify-workflow-runs-every-check.mjs";

const RUN_CONDITION = `\${{ !cancelled() && (github.event_name != 'pull_request' || needs.scope.result != 'success' || needs.scope.outputs.docs_only != 'true') }}`;

const AGGREGATE_RUN = "node .github/scripts/aggregate-verify-result.mjs";

const AGGREGATE_ENV = {
  EVENT_NAME: `\${{ github.event_name }}`,
  SCOPE_RESULT: `\${{ needs.scope.result }}`,
  SCOPE_DOCS_ONLY: `\${{ needs.scope.outputs.docs_only }}`,
  STATIC_RESULT: `\${{ needs.static.result }}`,
  TESTS_RESULT: `\${{ needs.tests.result }}`,
};

const HISTORY_SCAN_RUN = "node --test .github/scripts/no-secrets-in-commit-history.test.mjs";

const HISTORY_SCAN_BASE_REF = `\${{ github.event.pull_request.base.sha }}`;

function scopeJobLines({
  jobExtra = [],
  run = HISTORY_SCAN_RUN,
  stepExtra = [],
  baseRef = HISTORY_SCAN_BASE_REF,
} = {}) {
  return [
    "  scope:",
    "    if: github.event_name == 'pull_request'",
    ...jobExtra.map((line) => `    ${line}`),
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - run: node .github/scripts/change-scope.mjs",
    `      - run: ${run}`,
    ...stepExtra.map((line) => `        ${line}`),
    ...(baseRef === null ? [] : ["        env:", `          CHANGE_BASE_REF: ${baseRef}`]),
  ];
}

function verifyJobLines({
  needs = "[scope, static, tests]",
  condition = "always()",
  jobExtra = [],
  run = AGGREGATE_RUN,
  stepExtra = [],
  env = AGGREGATE_ENV,
} = {}) {
  return [
    "  verify:",
    `    needs: ${needs}`,
    ...(condition === null ? [] : [`    if: ${condition}`]),
    ...jobExtra.map((line) => `    ${line}`),
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - uses: actions/checkout@v7",
    `      - run: ${run}`,
    ...stepExtra.map((line) => `        ${line}`),
    "        env:",
    ...Object.entries(env).map(([name, value]) => `          ${name}: ${value}`),
  ];
}

function workflow({
  topExtra = [],
  scope = {},
  staticRun = "pnpm verify:static",
  shardValues = [1, 2, 3, 4],
  testsRun,
  staticIf = RUN_CONDITION,
  testsIf = RUN_CONDITION,
  staticJobExtra = [],
  testsJobExtra = [],
  testsMatrixExtra = [],
  staticStepExtra = [],
  testsStepExtra = [],
  verifyNeeds = "[scope, static, tests]",
  verifyIf = "always()",
  verifyJobExtra = [],
  verifyRun = AGGREGATE_RUN,
  verifyStepExtra = [],
  verifyEnv = AGGREGATE_ENV,
} = {}) {
  const shardLines = shardValues.map((value) => `          - ${value}`).join("\n");
  const testsRunLine =
    testsRun ?? `pnpm verify:tests --shard=\${{ matrix.shard }}/${shardValues.length}`;
  const verifyJob =
    verifyNeeds === null
      ? []
      : verifyJobLines({
          needs: verifyNeeds,
          condition: verifyIf,
          jobExtra: verifyJobExtra,
          run: verifyRun,
          stepExtra: verifyStepExtra,
          env: verifyEnv,
        });
  return [
    ...topExtra,
    "jobs:",
    ...(scope === null ? [] : scopeJobLines(scope)),
    "  static:",
    `    if: ${staticIf}`,
    ...staticJobExtra.map((line) => `    ${line}`),
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - run: pnpm install --frozen-lockfile",
    `      - run: ${staticRun}`,
    ...staticStepExtra.map((line) => `        ${line}`),
    "  tests:",
    `    if: ${testsIf}`,
    ...testsJobExtra.map((line) => `    ${line}`),
    "    runs-on: ubuntu-24.04",
    "    strategy:",
    "      matrix:",
    "        shard:",
    shardLines,
    ...testsMatrixExtra.map((line) => `        ${line}`),
    "    steps:",
    `      - run: ${testsRunLine}`,
    ...testsStepExtra.map((line) => `        ${line}`),
    ...verifyJob,
  ].join("\n");
}

const VERIFY_STATIC_SCRIPT =
  "tsc --noEmit && tsc --noEmit -p apps/backoffice && tsc --noEmit -p apps/pos && pnpm --filter @purosur/cloud build && biome ci . && pnpm depcruise && knip && node --test .github/scripts/*.test.mjs";

function packageJson({
  verify = "pnpm verify:static && pnpm verify:tests",
  verifyStatic = VERIFY_STATIC_SCRIPT,
  verifyTests = "vitest run",
} = {}) {
  return JSON.stringify({
    scripts: { verify, "verify:static": verifyStatic, "verify:tests": verifyTests },
  });
}

function assertSingleViolation(violations, pattern) {
  assert.equal(violations.length, 1, violations.join("\n"));
  assert.match(violations[0], pattern);
}

test("passes when the static job runs verify:static, the shards cover 1..n, and verify composes both", () => {
  const violations = findVerifyWorkflowViolations(workflow(), packageJson());

  assert.deepEqual(violations, []);
});

test("flags a missing scope job, which would leave a docs-only change's commits unscanned", () => {
  const violations = findVerifyWorkflowViolations(workflow({ scope: null }), packageJson());

  assertSingleViolation(violations, /no scope job/);
});

for (const [label, scope, pattern] of [
  [
    "does not scan the change's commit history",
    { run: "echo ok" },
    /scope job has no step whose run is exactly/,
  ],
  [
    "swallows the commit history scan's failure",
    { run: `${HISTORY_SCAN_RUN} || true` },
    /scope job has no step whose run is exactly/,
  ],
  [
    "scans the commit history without the change's base",
    { baseRef: null },
    /scope job's commit history scan step's CHANGE_BASE_REF is/,
  ],
  [
    "scans the commit history from the wrong base",
    { baseRef: `\${{ github.sha }}` },
    /scope job's commit history scan step's CHANGE_BASE_REF is/,
  ],
  [
    "lets the commit history scan fail without failing the job",
    { stepExtra: ["continue-on-error: true"] },
    /scope job's commit history scan step sets continue-on-error/,
  ],
  [
    "runs the commit history scan only under its own condition",
    { stepExtra: ["if: false"] },
    /scope job's commit history scan step has its own if/,
  ],
  [
    "overrides the commit history scan's shell",
    { stepExtra: ["shell: bash -c 'exit 0' {0}"] },
    /scope job's commit history scan step sets its own shell/,
  ],
  [
    "is allowed to fail without failing the workflow",
    { jobExtra: ["continue-on-error: true"] },
    /scope job sets continue-on-error/,
  ],
  [
    "overrides its steps' shell",
    { jobExtra: ["defaults:", "  run:", "    shell: bash -c 'exit 0' {0}"] },
    /scope job sets defaults/,
  ],
]) {
  test(`flags a scope job that ${label}`, () => {
    const violations = findVerifyWorkflowViolations(workflow({ scope }), packageJson());

    assertSingleViolation(violations, pattern);
  });
}

test("flags a missing static job", () => {
  const source = [
    "jobs:",
    ...scopeJobLines(),
    "  tests:",
    `    if: ${RUN_CONDITION}`,
    "    strategy:",
    "      matrix:",
    "        shard:",
    "          - 1",
    "          - 2",
    "    steps:",
    `      - run: pnpm verify:tests --shard=\${{ matrix.shard }}/2`,
    ...verifyJobLines({ needs: "[tests]" }),
  ].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 2, violations.join("\n"));
  assert.match(violations[0], /no static job/);
  assert.match(violations[1], /verify job does not need static/);
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
  const source = [
    "jobs:",
    ...scopeJobLines(),
    "  static:",
    `    if: ${RUN_CONDITION}`,
    "    steps:",
    "      - run: pnpm verify:static",
    ...verifyJobLines({ needs: "[static]" }),
  ].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 2, violations.join("\n"));
  assert.match(violations[0], /no tests job/);
  assert.match(violations[1], /verify job does not need tests/);
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
  const violations = findVerifyWorkflowViolations(
    workflow(),
    packageJson({ verify: "vitest run" }),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /"verify" script/);
});

for (const job of ["static", "tests"]) {
  test(`flags a ${job} job whose if can never be true`, () => {
    const violations = findVerifyWorkflowViolations(
      workflow({ [`${job}If`]: "false" }),
      packageJson(),
    );

    assertSingleViolation(violations, new RegExp(`${job} job runs under`));
  });

  test(`flags a ${job} job that runs even on a cancelled workflow`, () => {
    const violations = findVerifyWorkflowViolations(
      workflow({ [`${job}If`]: RUN_CONDITION.replace("!cancelled()", "always()") }),
      packageJson(),
    );

    assertSingleViolation(violations, new RegExp(`${job} job runs under`));
  });

  test(`flags a ${job} job allowed to fail without failing the workflow`, () => {
    const violations = findVerifyWorkflowViolations(
      workflow({ [`${job}JobExtra`]: ["continue-on-error: true"] }),
      packageJson(),
    );

    assertSingleViolation(violations, new RegExp(`${job} job sets continue-on-error`));
  });

  test(`flags a ${job} step that is allowed to fail without failing its job`, () => {
    const violations = findVerifyWorkflowViolations(
      workflow({ [`${job}StepExtra`]: ["continue-on-error: true"] }),
      packageJson(),
    );

    assertSingleViolation(
      violations,
      new RegExp(`${job} job's verify:${job} step sets continue-on-error`),
    );
  });

  test(`flags a ${job} step that only runs under its own condition`, () => {
    const violations = findVerifyWorkflowViolations(
      workflow({ [`${job}StepExtra`]: ["if: false"] }),
      packageJson(),
    );

    assertSingleViolation(violations, new RegExp(`${job} job's verify:${job} step has its own if`));
  });
}

test("flags a static run command whose failure is swallowed", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ staticRun: "pnpm verify:static || true" }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify:static/);
});

test("flags a tests run command whose failure is swallowed", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ testsRun: `pnpm verify:tests --shard=\${{ matrix.shard }}/4 || true` }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify:tests/);
});

test("flags a missing verify job", () => {
  const violations = findVerifyWorkflowViolations(workflow({ verifyNeeds: null }), packageJson());

  assertSingleViolation(violations, /no verify job/);
});

test("flags a verify job that does not wait for the tests job", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyNeeds: "[scope, static]" }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job does not need tests/);
});

test("flags a verify job whose needs names only the static job", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyNeeds: "static" }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job does not need tests/);
});

test("flags a tests matrix that excludes a shard combination", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ testsMatrixExtra: ["exclude:", "  - shard: 4"] }),
    packageJson(),
  );

  assertSingleViolation(violations, /tests job strategy\.matrix sets exclude/);
});

test("flags a tests matrix that includes an extra shard combination", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ testsMatrixExtra: ["include:", "  - shard: 5"] }),
    packageJson(),
  );

  assertSingleViolation(violations, /tests job strategy\.matrix sets include/);
});

for (const [label, condition] of [
  ["never runs", "false"],
  ["skips a cancelled run", `\${{ !cancelled() }}`],
  ["runs only on success", "success()"],
]) {
  test(`flags a verify job whose if ${label}`, () => {
    const violations = findVerifyWorkflowViolations(
      workflow({ verifyIf: condition }),
      packageJson(),
    );

    assertSingleViolation(violations, /verify job runs under/);
  });
}

test("flags a verify job with no if, which a failed static or tests job skips", () => {
  const violations = findVerifyWorkflowViolations(workflow({ verifyIf: null }), packageJson());

  assertSingleViolation(violations, /verify job runs under/);
});

test("flags a verify job allowed to fail without failing the workflow", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyJobExtra: ["continue-on-error: true"] }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job sets continue-on-error/);
});

test("flags a verify job that no longer runs the aggregate script", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyRun: "echo ok" }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job has no step whose run is exactly/);
});

test("flags a verify job whose aggregate run swallows its failure", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyRun: `${AGGREGATE_RUN} || true` }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job has no step whose run is exactly/);
});

test("flags a verify aggregate step allowed to fail without failing its job", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyStepExtra: ["continue-on-error: true"] }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job's aggregate step sets continue-on-error/);
});

test("flags a verify aggregate step that only runs under its own condition", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyStepExtra: ["if: false"] }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job's aggregate step has its own if/);
});

for (const name of Object.keys(AGGREGATE_ENV)) {
  test(`flags a verify aggregate step that does not pass ${name}`, () => {
    const verifyEnv = Object.fromEntries(
      Object.entries(AGGREGATE_ENV).filter(([envName]) => envName !== name),
    );

    const violations = findVerifyWorkflowViolations(workflow({ verifyEnv }), packageJson());

    assertSingleViolation(violations, new RegExp(`aggregate step's ${name} is`));
  });
}

test("flags a verify aggregate step whose tests result is wired to the static job", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({
      verifyEnv: { ...AGGREGATE_ENV, TESTS_RESULT: `\${{ needs.static.result }}` },
    }),
    packageJson(),
  );

  assertSingleViolation(violations, /aggregate step's TESTS_RESULT is/);
});

test("flags a verify aggregate step whose static result is hardcoded to success", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyEnv: { ...AGGREGATE_ENV, STATIC_RESULT: "success" } }),
    packageJson(),
  );

  assertSingleViolation(violations, /aggregate step's STATIC_RESULT is/);
});

test("flags a verify:static script that turns the required commands into a shell comment", () => {
  const violations = findVerifyWorkflowViolations(
    workflow(),
    packageJson({ verifyStatic: `true # && ${VERIFY_STATIC_SCRIPT}` }),
  );

  assertSingleViolation(violations, /"verify:static" script/);
});

for (const [label, options, pattern] of [
  [
    "the static job's verify:static step",
    { staticStepExtra: ["shell: bash -c 'exit 0' {0}"] },
    /static job's verify:static step sets its own shell/,
  ],
  [
    "the tests job's verify:tests step",
    { testsStepExtra: ["shell: bash -c 'exit 0' {0}"] },
    /tests job's verify:tests step sets its own shell/,
  ],
  [
    "the verify job's aggregate step",
    { verifyStepExtra: ["shell: bash -c 'exit 0' {0}"] },
    /verify job's aggregate step sets its own shell/,
  ],
  [
    "the static job's defaults",
    { staticJobExtra: ["defaults:", "  run:", "    shell: bash -c 'exit 0' {0}"] },
    /static job sets defaults/,
  ],
  [
    "the tests job's defaults",
    { testsJobExtra: ["defaults:", "  run:", "    shell: bash -c 'exit 0' {0}"] },
    /tests job sets defaults/,
  ],
  [
    "the verify job's defaults",
    { verifyJobExtra: ["defaults:", "  run:", "    shell: bash -c 'exit 0' {0}"] },
    /verify job sets defaults/,
  ],
  [
    "the workflow's defaults",
    { topExtra: ["defaults:", "  run:", "    shell: bash -c 'exit 0' {0}"] },
    /verify\.yml sets workflow-level defaults/,
  ],
]) {
  test(`flags a shell override in ${label}, which can discard the command's exit status`, () => {
    const violations = findVerifyWorkflowViolations(workflow(options), packageJson());

    assertSingleViolation(violations, pattern);
  });
}

for (const [separator, label] of [
  ["\n", "a newline"],
  ["\r", "a carriage return"],
]) {
  test(`flags a verify:static script that hides a command behind ${label}`, () => {
    const violations = findVerifyWorkflowViolations(
      workflow(),
      packageJson({
        verifyStatic: `${VERIFY_STATIC_SCRIPT} && pnpm lint:extra${separator}true`,
      }),
    );

    assertSingleViolation(violations, /"verify:static" script/);
  });
}

for (const dropped of [
  "tsc --noEmit",
  "tsc --noEmit -p apps/backoffice",
  "tsc --noEmit -p apps/pos",
  "pnpm --filter @purosur/cloud build",
  "biome ci .",
  "pnpm depcruise",
  "knip",
  "node --test .github/scripts/*.test.mjs",
]) {
  test(`flags a verify:static script that no longer runs ${dropped}`, () => {
    const verifyStatic = VERIFY_STATIC_SCRIPT.split(" && ")
      .filter((command) => command !== dropped)
      .join(" && ");

    const violations = findVerifyWorkflowViolations(workflow(), packageJson({ verifyStatic }));

    assertSingleViolation(violations, /"verify:static" script/);
  });
}

test("flags a verify:static script that swallows a failing check", () => {
  const violations = findVerifyWorkflowViolations(
    workflow(),
    packageJson({
      verifyStatic: VERIFY_STATIC_SCRIPT.replace("tsc --noEmit", "tsc --noEmit || true"),
    }),
  );

  assertSingleViolation(violations, /"verify:static" script/);
});

test("flags a verify:static script that ends in a command that always succeeds", () => {
  const violations = findVerifyWorkflowViolations(
    workflow(),
    packageJson({ verifyStatic: `${VERIFY_STATIC_SCRIPT}; true` }),
  );

  assertSingleViolation(violations, /"verify:static" script/);
});

test("accepts a verify:static script that adds another check", () => {
  const violations = findVerifyWorkflowViolations(
    workflow(),
    packageJson({ verifyStatic: `${VERIFY_STATIC_SCRIPT} && pnpm lint:extra` }),
  );

  assert.deepEqual(violations, []);
});

test("flags a verify:tests script that is not exactly vitest run", () => {
  const violations = findVerifyWorkflowViolations(
    workflow(),
    packageJson({ verifyTests: "vitest run --passWithNoTests || true" }),
  );

  assertSingleViolation(violations, /"verify:tests" script/);
});

test("reports a workflow that does not parse as YAML", () => {
  const source = ["jobs:", "  static:", "    steps:", '      - run: "unterminated'].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 1);
  assert.match(violations[0], /does not parse as YAML/);
});

test("checkRepository reads the real workflow file and package.json path", () => {
  const files = {
    ".github/workflows/verify.yml": workflow(),
    "package.json": packageJson(),
  };

  const violations = checkRepository({ readFile: (path) => files[path] });

  assert.deepEqual(violations, []);
});

test("the real Verify workflow runs every part of pnpm verify", () => {
  const violations = checkRepository();

  assert.deepEqual(violations, []);
});
