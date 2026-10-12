import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkRepository,
  findCloudPostgresImageViolations,
  findLocalPostgresImageViolations,
  findPlaywrightImageViolations,
  findPlaywrightInstallViolations,
  findPrePulledJobTimeoutViolations,
  findVerifyWorkflowViolations,
} from "./verify-workflow-runs-every-check.mjs";

const RUN_CONDITION = `\${{ !cancelled() && (github.event_name != 'pull_request' || needs.scope.result != 'success' || needs.scope.outputs.docs_only != 'true') }}`;
const TESTS_CONDITION = `\${{ !cancelled() && (github.event_name != 'pull_request' || needs.scope.result != 'success' || needs.scope.outputs.tests_needed != 'false') }}`;
const VISUAL_CONDITION = `\${{ !cancelled() && needs.scope.outputs.catalog_changed != 'false' }}`;

const AGGREGATE_RUN = "node .github/scripts/aggregate-verify-result.mjs";

const AGGREGATE_ENV = {
  EVENT_NAME: `\${{ github.event_name }}`,
  SCOPE_RESULT: `\${{ needs.scope.result }}`,
  SCOPE_DOCS_ONLY: `\${{ needs.scope.outputs.docs_only }}`,
  SCOPE_TESTS_NEEDED: `\${{ needs.scope.outputs.tests_needed }}`,
  SCOPE_CATALOG_CHANGED: `\${{ needs.scope.outputs.catalog_changed }}`,
  STATIC_RESULT: `\${{ needs.static.result }}`,
  TESTS_RESULT: `\${{ needs.tests.result }}`,
  VISUAL_RESULT: `\${{ needs.visual.result }}`,
};

const HISTORY_SCAN_RUN = "node --test .github/scripts/no-secrets-in-commit-history.test.mjs";

const HISTORY_SCAN_BASE_REF = `\${{ github.event.pull_request.base.sha }}`;

const SCOPE_OUTPUTS = {
  docs_only: `\${{ steps.scope.outputs.docs_only }}`,
  tests_needed: `\${{ steps.scope.outputs.tests_needed }}`,
  catalog_changed: `\${{ steps.scope.outputs.catalog_changed }}`,
};

function scopeJobLines({
  jobExtra = [],
  outputs = SCOPE_OUTPUTS,
  scopeStepId = "scope",
  scopeRun = "node .github/scripts/change-scope.mjs",
  run = HISTORY_SCAN_RUN,
  stepExtra = [],
  baseRef = HISTORY_SCAN_BASE_REF,
} = {}) {
  return [
    "  scope:",
    "    if: github.event_name == 'pull_request'",
    ...jobExtra.map((line) => `    ${line}`),
    "    runs-on: ubuntu-24.04",
    "    outputs:",
    ...Object.entries(outputs).map(([name, value]) => `      ${name}: ${value}`),
    "    steps:",
    `      - id: ${scopeStepId}`,
    `        run: ${scopeRun}`,
    `      - run: ${run}`,
    ...stepExtra.map((line) => `        ${line}`),
    ...(baseRef === null ? [] : ["        env:", `          CHANGE_BASE_REF: ${baseRef}`]),
  ];
}

function verifyJobLines({
  needs = "[scope, static, tests, visual]",
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
  testsIf = TESTS_CONDITION,
  staticJobExtra = [],
  testsJobExtra = [],
  testsMatrixExtra = [],
  staticStepExtra = [],
  testsStepExtra = [],
  visualRun = "pnpm verify:visual",
  visualIf = VISUAL_CONDITION,
  visualJobExtra = [],
  visualStepExtra = [],
  includeVisual = true,
  verifyNeeds = "[scope, static, tests, visual]",
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
  const visualJob = includeVisual
    ? [
        "  visual:",
        `    if: ${visualIf}`,
        ...visualJobExtra.map((line) => `    ${line}`),
        "    runs-on: ubuntu-24.04",
        "    steps:",
        `      - run: ${visualRun}`,
        ...visualStepExtra.map((line) => `        ${line}`),
      ]
    : [];
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
    ...visualJob,
    ...verifyJob,
  ].join("\n");
}

const VERIFY_STATIC_SCRIPT =
  "tsc --noEmit && tsc --noEmit -p apps/backoffice && tsc --noEmit -p apps/pos && tsc --noEmit -p apps/cloud/tsconfig.test.json && pnpm --filter @purosur/cloud build && pnpm --filter @purosur/backoffice build && node .github/scripts/backoffice-download-budget.mjs && pnpm --filter @purosur/pos build && biome ci . --error-on-warnings && pnpm depcruise && knip && node .github/scripts/react-compiler-check.mjs && node --test .github/scripts/*.test.mjs .github/scripts/test-support/*.test.mjs .claude/hooks/*.test.mjs";

function packageJson({
  verify = "pnpm verify:static && pnpm verify:tests && pnpm verify:visual",
  verifyStatic = VERIFY_STATIC_SCRIPT,
  verifyTests = "vitest run --project='!catalog-visual'",
  verifyVisual = "vitest run --project=catalog-visual",
} = {}) {
  return JSON.stringify({
    scripts: {
      verify,
      "verify:static": verifyStatic,
      "verify:tests": verifyTests,
      "verify:visual": verifyVisual,
    },
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
  [
    "takes the test shards' decision from the docs-only output",
    { outputs: { ...SCOPE_OUTPUTS, tests_needed: SCOPE_OUTPUTS.docs_only } },
    /scope job's tests_needed output is .*steps\.scope\.outputs\.docs_only.*, expected .*steps\.scope\.outputs\.tests_needed/,
  ],
  [
    "takes the docs-only decision from the catalog output",
    { outputs: { ...SCOPE_OUTPUTS, docs_only: SCOPE_OUTPUTS.catalog_changed } },
    /scope job's docs_only output is/,
  ],
  [
    "takes the catalog decision from another step",
    {
      outputs: {
        ...SCOPE_OUTPUTS,
        catalog_changed: `\${{ steps.other.outputs.catalog_changed }}`,
      },
    },
    /scope job's catalog_changed output is/,
  ],
  [
    "hard-codes a decision instead of taking it from the scope step",
    { outputs: { ...SCOPE_OUTPUTS, tests_needed: "false" } },
    /scope job's tests_needed output is/,
  ],
  [
    "does not publish the catalog decision",
    { outputs: { docs_only: SCOPE_OUTPUTS.docs_only, tests_needed: SCOPE_OUTPUTS.tests_needed } },
    /scope job's catalog_changed output is/,
  ],
  [
    "publishes another value that is not the scope step's output of the same name",
    { outputs: { ...SCOPE_OUTPUTS, skip_all: SCOPE_OUTPUTS.docs_only } },
    /scope job's skip_all output is/,
  ],
  [
    "decides its scope in a step without the id its outputs read",
    { scopeStepId: "decide" },
    /scope job has no step with id scope whose run is exactly/,
  ],
  [
    "gives the scope id to a step that does not decide the scope",
    { scopeRun: 'echo docs_only=true >> "$GITHUB_OUTPUT"' },
    /scope job has no step with id scope whose run is exactly/,
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
    `    if: ${TESTS_CONDITION}`,
    "    strategy:",
    "      matrix:",
    "        shard:",
    "          - 1",
    "          - 2",
    "    steps:",
    `      - run: pnpm verify:tests --shard=\${{ matrix.shard }}/2`,
    "  visual:",
    `    if: ${VISUAL_CONDITION}`,
    "    steps:",
    "      - run: pnpm verify:visual",
    ...verifyJobLines({ needs: "[tests, visual]" }),
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
    "  visual:",
    `    if: ${VISUAL_CONDITION}`,
    "    steps:",
    "      - run: pnpm verify:visual",
    ...verifyJobLines({ needs: "[static, visual]" }),
  ].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 2, violations.join("\n"));
  assert.match(violations[0], /no tests job/);
  assert.match(violations[1], /verify job does not need tests/);
});

test("flags a missing visual job", () => {
  const source = [
    "jobs:",
    ...scopeJobLines(),
    "  static:",
    `    if: ${RUN_CONDITION}`,
    "    steps:",
    "      - run: pnpm verify:static",
    "  tests:",
    `    if: ${TESTS_CONDITION}`,
    "    strategy:",
    "      matrix:",
    "        shard:",
    "          - 1",
    "          - 2",
    "    steps:",
    `      - run: pnpm verify:tests --shard=\${{ matrix.shard }}/2`,
    ...verifyJobLines({ needs: "[static, tests]" }),
  ].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 2, violations.join("\n"));
  assert.match(violations[0], /no visual job/);
  assert.match(violations[1], /verify job does not need visual/);
});

test("flags a visual job that no longer runs verify:visual", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ visualRun: "pnpm lint" }),
    packageJson(),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /verify:visual/);
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

test("flags a tests job that still skips only for a docs-only change", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ testsIf: RUN_CONDITION }),
    packageJson(),
  );

  assertSingleViolation(violations, /tests job runs under/);
});

test("flags a static job that skips whenever the test shards read no changed path", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ staticIf: TESTS_CONDITION }),
    packageJson(),
  );

  assertSingleViolation(violations, /static job runs under/);
});

for (const job of ["static", "tests", "visual"]) {
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
    workflow({ verifyNeeds: "[scope, static, visual]" }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job does not need tests/);
});

test("flags a verify job whose needs names only the static job", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyNeeds: "[static, visual]" }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job does not need tests/);
});

test("flags a verify job that does not wait for the visual job", () => {
  const violations = findVerifyWorkflowViolations(
    workflow({ verifyNeeds: "[scope, static, tests]" }),
    packageJson(),
  );

  assertSingleViolation(violations, /verify job does not need visual/);
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
    "the visual job's verify:visual step",
    { visualStepExtra: ["shell: bash -c 'exit 0' {0}"] },
    /visual job's verify:visual step sets its own shell/,
  ],
  [
    "the visual job's defaults",
    { visualJobExtra: ["defaults:", "  run:", "    shell: bash -c 'exit 0' {0}"] },
    /visual job sets defaults/,
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
  "tsc --noEmit -p apps/cloud/tsconfig.test.json",
  "pnpm --filter @purosur/cloud build",
  "pnpm --filter @purosur/backoffice build",
  "node .github/scripts/backoffice-download-budget.mjs",
  "pnpm --filter @purosur/pos build",
  "biome ci . --error-on-warnings",
  "pnpm depcruise",
  "knip",
  "node .github/scripts/react-compiler-check.mjs",
  "node --test .github/scripts/*.test.mjs .github/scripts/test-support/*.test.mjs .claude/hooks/*.test.mjs",
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

test("flags a verify:tests script that is not exactly the expected composition", () => {
  const violations = findVerifyWorkflowViolations(
    workflow(),
    packageJson({ verifyTests: "vitest run --passWithNoTests || true" }),
  );

  assertSingleViolation(violations, /"verify:tests" script/);
});

test("flags a verify:visual script that is not exactly the expected composition", () => {
  const violations = findVerifyWorkflowViolations(
    workflow(),
    packageJson({ verifyVisual: "vitest run --project=catalog-visual || true" }),
  );

  assertSingleViolation(violations, /"verify:visual" script/);
});

test("reports a workflow that does not parse as YAML", () => {
  const source = ["jobs:", "  static:", "    steps:", '      - run: "unterminated'].join("\n");

  const violations = findVerifyWorkflowViolations(source, packageJson());

  assert.equal(violations.length, 1);
  assert.match(violations[0], /does not parse as YAML/);
});

const POSTGRES_DIGEST = "sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873";
const PINNED_POSTGRES_IMAGE = `ghcr.io/ljguardiola/postgres:18-alpine@${POSTGRES_DIGEST}`;
const ECR_POSTGRES_IMAGE = `public.ecr.aws/docker/library/postgres:18-alpine@${POSTGRES_DIGEST}`;
const GITHUB_TOKEN = `\${{ github.token }}`;
const SIGN_IN_TO_GHCR =
  'echo "$GITHUB_TOKEN" | docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin';
const PLAYWRIGHT_DIGEST = "sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27";
const PINNED_PLAYWRIGHT_IMAGE = `ghcr.io/ljguardiola/playwright:v1.63.0-noble@${PLAYWRIGHT_DIGEST}`;
const MCR_PLAYWRIGHT_IMAGE = `mcr.microsoft.com/playwright:v1.63.0-noble@${PLAYWRIGHT_DIGEST}`;
const INSTALLED_PLAYWRIGHT_VERSION = "1.63.0";

function lookUpMirrorLines(constant) {
  return [
    'echo "$GITHUB_TOKEN" | skopeo login ghcr.io --username "$GITHUB_ACTOR" --password-stdin',
    `if timeout 60 skopeo inspect --raw "docker://\${${constant}%%:*}@\${${constant}#*@}" > /dev/null; then`,
    '  echo "mirrored=true" >> "$GITHUB_OUTPUT"',
    "else",
    '  echo "mirrored=false" >> "$GITHUB_OUTPUT"',
    "fi",
  ];
}

function copyMirrorLines(constant, attemptSeconds) {
  return [
    'echo "$GITHUB_TOKEN" | skopeo login ghcr.io --username "$GITHUB_ACTOR" --password-stdin',
    "for delay in 0 15 30 60; do",
    '  sleep "$delay"',
    `  timeout ${attemptSeconds} skopeo copy --all --preserve-digests "docker://\${SOURCE_IMAGE%%:*}@\${SOURCE_IMAGE#*@}" "docker://\${${constant}%@*}" && exit 0`,
    "done",
    "exit 1",
  ];
}

function pullWithRetriesLines(imageEnv, attemptSeconds) {
  return [
    "for delay in 0 15 30 60; do",
    '  sleep "$delay"',
    `  timeout ${attemptSeconds} docker pull "$${imageEnv}" && exit 0`,
    "done",
    "exit 1",
  ];
}

const POSTGRES_MIRROR = {
  lookupJob: "postgres-image",
  copyJob: "postgres-image-copy",
  sourceImage: ECR_POSTGRES_IMAGE,
  dockerHubSourceImage: `postgres:18-alpine@${POSTGRES_DIGEST}`,
  otherDigestSourceImage: `public.ecr.aws/docker/library/postgres:18-alpine@${PLAYWRIGHT_DIGEST}`,
  copyAttemptSeconds: 300,
  copyRetrySeconds: 1305,
  copyJobTimeoutMinutes: 25,
  enoughCopyStepTimeoutMinutes: 22,
  notOnGhcrImages: [
    ECR_POSTGRES_IMAGE,
    `mirror:5000/library/postgres:18-alpine@${POSTGRES_DIGEST}`,
    `postgres:18-alpine@${POSTGRES_DIGEST}`,
    `docker.io/library/postgres:18-alpine@${POSTGRES_DIGEST}`,
  ],
  otherImage: `ghcr.io/ljguardiola/postgres:17-alpine@${POSTGRES_DIGEST}`,
};

const PLAYWRIGHT_MIRROR = {
  lookupJob: "playwright-image",
  copyJob: "playwright-image-copy",
  sourceImage: MCR_PLAYWRIGHT_IMAGE,
  dockerHubSourceImage: `playwright:v1.63.0-noble@${PLAYWRIGHT_DIGEST}`,
  otherDigestSourceImage: `mcr.microsoft.com/playwright:v1.63.0-noble@${POSTGRES_DIGEST}`,
  copyAttemptSeconds: 600,
  copyRetrySeconds: 2505,
  copyJobTimeoutMinutes: 45,
  enoughCopyStepTimeoutMinutes: 42,
  notOnGhcrImages: [
    MCR_PLAYWRIGHT_IMAGE,
    `mirror:5000/playwright:v1.63.0-noble@${PLAYWRIGHT_DIGEST}`,
    `localhost/playwright:v1.63.0-noble@${PLAYWRIGHT_DIGEST}`,
    `docker.io/acme/playwright:v1.63.0-noble@${PLAYWRIGHT_DIGEST}`,
  ],
  otherImage: `ghcr.io/ljguardiola/playwright:v1.62.0-noble@${PLAYWRIGHT_DIGEST}`,
};

function findPlaywrightViolationsOf(job) {
  return (workflowSource, setupSource) =>
    findPlaywrightImageViolations(workflowSource, setupSource, INSTALLED_PLAYWRIGHT_VERSION, job);
}

const PRE_PULLED_IMAGES = [
  {
    label: "the cloud's Postgres image",
    job: "tests",
    testsRun: `pnpm verify:tests --shard=\${{ matrix.shard }}/4`,
    testsScript: "verify:tests",
    constant: "POSTGRES_IMAGE",
    image: PINNED_POSTGRES_IMAGE,
    tagOnly: "ghcr.io/ljguardiola/postgres:18-alpine",
    mirror: POSTGRES_MIRROR,
    pullAttemptSeconds: 120,
    otherPullAttemptSeconds: 300,
    pullRetrySeconds: 585,
    enoughPullTimeoutMinutes: 10,
    jobSeconds: 1485,
    jobTimeoutMinutes: 25,
    findViolations: (workflowSource, setupSource) =>
      findCloudPostgresImageViolations(workflowSource, setupSource),
  },
  {
    label: "the Playwright image",
    job: "tests",
    testsRun: `pnpm verify:tests --shard=\${{ matrix.shard }}/4`,
    testsScript: "verify:tests",
    constant: "PLAYWRIGHT_SERVER_IMAGE",
    image: PINNED_PLAYWRIGHT_IMAGE,
    tagOnly: "ghcr.io/ljguardiola/playwright:v1.63.0-noble",
    mirror: PLAYWRIGHT_MIRROR,
    pullAttemptSeconds: 300,
    otherPullAttemptSeconds: 120,
    pullRetrySeconds: 1305,
    enoughPullTimeoutMinutes: 22,
    jobSeconds: 2205,
    jobTimeoutMinutes: 37,
    findViolations: findPlaywrightViolationsOf("tests"),
  },
  {
    label: "the Playwright image",
    job: "visual",
    testsRun: "pnpm verify:visual",
    testsScript: "verify:visual",
    constant: "PLAYWRIGHT_SERVER_IMAGE",
    image: PINNED_PLAYWRIGHT_IMAGE,
    tagOnly: "ghcr.io/ljguardiola/playwright:v1.63.0-noble",
    mirror: PLAYWRIGHT_MIRROR,
    pullAttemptSeconds: 300,
    otherPullAttemptSeconds: 120,
    pullRetrySeconds: 1305,
    enoughPullTimeoutMinutes: 22,
    jobSeconds: 2205,
    jobTimeoutMinutes: 37,
    findViolations: findPlaywrightViolationsOf("visual"),
  },
];

const [POSTGRES_SPEC, PLAYWRIGHT_TESTS_SPEC, PLAYWRIGHT_VISUAL_SPEC] = PRE_PULLED_IMAGES;
const MIRRORED_IMAGES = [POSTGRES_SPEC, PLAYWRIGHT_TESTS_SPEC];

function setupDeclaring(constant, image) {
  return [
    'import { GenericContainer } from "testcontainers";',
    "",
    `const ${constant} =`,
    `  "${image}";`,
  ].join("\n");
}

function pullStepLines(
  spec,
  {
    pullLines = pullWithRetriesLines(spec.constant, spec.pullAttemptSeconds),
    pulledImage = spec.image,
    pullStepExtra = [],
    pullTimeoutMinutes = spec.enoughPullTimeoutMinutes,
  } = {},
) {
  return [
    `      - name: Pull ${spec.label}`,
    ...(pullTimeoutMinutes === null ? [] : [`        timeout-minutes: ${pullTimeoutMinutes}`]),
    ...pullStepExtra.map((line) => `        ${line}`),
    "        run: |",
    ...pullLines.map((line) => `          ${line}`),
    "        env:",
    `          ${spec.constant}: ${pulledImage}`,
  ];
}

function jobWithPull(
  spec,
  {
    pullLines,
    pulledImage = spec.image,
    pullAfterTests = false,
    pullStepExtra,
    pullTimeoutMinutes,
    alsoPulls = [],
    testsEnv = { TESTCONTAINERS_RYUK_DISABLED: '"true"' },
    testsTimeoutMinutes = 15,
    jobTimeoutMinutes = spec.jobTimeoutMinutes,
    mirror = {},
    signInAfterPull = false,
  } = {},
) {
  const mirrorLines = ghcrMirrorLines(spec, { mirroredImage: spec.image, ...mirror });
  const pullStep = [
    ...alsoPulls.flatMap((other) => pullStepLines(other)),
    ...pullStepLines(spec, { pullLines, pulledImage, pullStepExtra, pullTimeoutMinutes }),
  ];
  const testsStep = [
    `      - run: ${spec.testsRun}`,
    ...(testsTimeoutMinutes === null ? [] : [`        timeout-minutes: ${testsTimeoutMinutes}`]),
    ...(Object.keys(testsEnv).length === 0
      ? []
      : ["        env:", ...Object.entries(testsEnv).map(([k, v]) => `          ${k}: ${v}`)]),
  ];
  return [
    "jobs:",
    ...mirrorLines.jobs,
    `  ${spec.job}:`,
    ...(jobTimeoutMinutes === null ? [] : [`    timeout-minutes: ${jobTimeoutMinutes}`]),
    ...mirrorLines.consumerJobHeader,
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - run: pnpm install --frozen-lockfile",
    ...(signInAfterPull ? [] : mirrorLines.signInStep),
    ...(pullAfterTests ? [...testsStep, ...pullStep] : [...pullStep, ...testsStep]).flatMap(
      (line) =>
        signInAfterPull && line === `      - run: ${spec.testsRun}`
          ? [...mirrorLines.signInStep, line]
          : [line],
    ),
  ].join("\n");
}

function ghcrMirrorLines(
  spec,
  {
    mirroredImage,
    sourceImage = spec.mirror.sourceImage,
    lookupPermissions = ["packages: read"],
    lookupLines = lookUpMirrorLines(spec.constant),
    lookupOutput = `\${{ steps.mirror.outputs.mirrored }}`,
    lookupStepId = "mirror",
    lookupToken = GITHUB_TOKEN,
    copyNeeds = [spec.mirror.lookupJob],
    copyCondition = `\${{ needs.${spec.mirror.lookupJob}.outputs.mirrored == 'false' }}`,
    copyJobTimeoutMinutes = spec.mirror.copyJobTimeoutMinutes,
    copyStepTimeoutMinutes,
    copyToken = GITHUB_TOKEN,
    copyPermissions = ["packages: write"],
    copyLines = copyMirrorLines(spec.constant, spec.mirror.copyAttemptSeconds),
    consumerNeeds = ["scope", spec.mirror.lookupJob, spec.mirror.copyJob],
    consumerPermissions = ["contents: read", "packages: read"],
    signIn = SIGN_IN_TO_GHCR,
    signInToken = GITHUB_TOKEN,
  },
) {
  const block = (indent, lines) => lines.map((line) => `${" ".repeat(indent)}${line}`);
  return {
    jobs: [
      `  ${spec.mirror.lookupJob}:`,
      "    needs: [scope]",
      "    runs-on: ubuntu-24.04",
      "    permissions:",
      ...block(6, lookupPermissions),
      "    outputs:",
      `      mirrored: ${lookupOutput}`,
      "    steps:",
      `      - id: ${lookupStepId}`,
      "        run: |",
      ...block(10, lookupLines),
      "        env:",
      `          GITHUB_TOKEN: ${lookupToken}`,
      `          ${spec.constant}: ${mirroredImage}`,
      `  ${spec.mirror.copyJob}:`,
      `    needs: [${copyNeeds.join(", ")}]`,
      `    if: ${copyCondition}`,
      "    runs-on: ubuntu-24.04",
      `    timeout-minutes: ${copyJobTimeoutMinutes}`,
      "    permissions:",
      ...block(6, copyPermissions),
      "    steps:",
      "      - run: |",
      ...block(10, copyLines),
      ...(copyStepTimeoutMinutes === undefined
        ? []
        : [`        timeout-minutes: ${copyStepTimeoutMinutes}`]),
      "        env:",
      `          GITHUB_TOKEN: ${copyToken}`,
      `          SOURCE_IMAGE: ${sourceImage}`,
      `          ${spec.constant}: ${mirroredImage}`,
    ],
    consumerJobHeader: [
      `    needs: [${consumerNeeds.join(", ")}]`,
      "    permissions:",
      ...block(6, consumerPermissions),
    ],
    signInStep: [
      `      - run: ${signIn}`,
      "        env:",
      `          GITHUB_TOKEN: ${signInToken}`,
    ],
  };
}

function violationsWithMirror(spec, mirror, { pulledImage = spec.image } = {}) {
  return spec.findViolations(
    jobWithPull(spec, { pulledImage, mirror: { mirroredImage: pulledImage, ...mirror } }),
    setupDeclaring(spec.constant, pulledImage),
  );
}

for (const spec of PRE_PULLED_IMAGES) {
  const setup = (image = spec.image) => setupDeclaring(spec.constant, image);

  test(`passes when the ${spec.job} job pulls ${spec.label}, pinned by digest, with retries before its tests`, () => {
    const violations = spec.findViolations(jobWithPull(spec), setup());

    assert.deepEqual(violations, []);
  });

  test(`flags ${spec.label} referenced by a tag alone, which can move to other bytes`, () => {
    const violations = spec.findViolations(
      jobWithPull(spec, { pulledImage: spec.tagOnly, mirror: { mirroredImage: spec.tagOnly } }),
      setup(spec.tagOnly),
    );

    assertSingleViolation(violations, /not pinned by digest/);
  });

  test(`flags a global setup whose ${spec.constant} cannot be read`, () => {
    const violations = spec.findViolations(jobWithPull(spec), 'const IMAGE = "postgres";');

    assertSingleViolation(violations, new RegExp(`no ${spec.constant}`));
  });

  test(`flags a ${spec.job} job that pulls a different image from ${spec.label}`, () => {
    const violations = spec.findViolations(
      jobWithPull(spec, { pulledImage: spec.tagOnly }),
      setup(),
    );

    assertSingleViolation(violations, new RegExp(`pulls \`${spec.tagOnly}\``));
  });

  test(`flags a ${spec.job} job that pulls ${spec.label} only after running its tests`, () => {
    const violations = spec.findViolations(jobWithPull(spec, { pullAfterTests: true }), setup());

    assertSingleViolation(violations, new RegExp(`before its ${spec.testsScript} step`));
  });

  test(`flags a ${spec.job} job that pulls ${spec.label} once, without retrying`, () => {
    const violations = spec.findViolations(
      jobWithPull(spec, { pullLines: [`docker pull "$${spec.constant}"`] }),
      setup(),
    );

    assertSingleViolation(violations, new RegExp(`before its ${spec.testsScript} step`));
  });

  test(`flags a ${spec.job} job whose pull attempt of ${spec.label} can stall without a time limit`, () => {
    const violations = spec.findViolations(
      jobWithPull(spec, {
        pullLines: pullWithRetriesLines(spec.constant, spec.pullAttemptSeconds).map((line) =>
          line.replace(`timeout ${spec.pullAttemptSeconds} `, ""),
        ),
      }),
      setup(),
    );

    assertSingleViolation(violations, new RegExp(`before its ${spec.testsScript} step`));
  });

  test(`flags a ${spec.job} job whose pull attempt of ${spec.label} gives up after ${spec.otherPullAttemptSeconds} seconds instead of ${spec.pullAttemptSeconds}`, () => {
    const violations = spec.findViolations(
      jobWithPull(spec, {
        pullLines: pullWithRetriesLines(spec.constant, spec.otherPullAttemptSeconds),
      }),
      setup(),
    );

    assertSingleViolation(violations, new RegExp(`before its ${spec.testsScript} step`));
  });

  test(`flags a ${spec.job} job whose pull step of ${spec.label} sets no time limit`, () => {
    const violations = spec.findViolations(
      jobWithPull(spec, { pullTimeoutMinutes: null }),
      setup(),
    );

    assertSingleViolation(
      violations,
      new RegExp(`${spec.job} job's pull step of .* sets no timeout-minutes`),
    );
  });

  test(`flags a ${spec.job} job whose pull step of ${spec.label} times out before its last attempt can`, () => {
    const shortMinutes = spec.enoughPullTimeoutMinutes - 1;
    const violations = spec.findViolations(
      jobWithPull(spec, { pullTimeoutMinutes: shortMinutes }),
      setup(),
    );

    assertSingleViolation(
      violations,
      new RegExp(
        `${spec.job} job's pull step of .* allows ${shortMinutes} minutes, less than the ${spec.pullRetrySeconds} seconds its pull attempts and their delays can take`,
      ),
    );
  });

  test(`passes a ${spec.job} job whose pull step of ${spec.label} times out just after its last attempt can`, () => {
    const violations = spec.findViolations(
      jobWithPull(spec, { pullTimeoutMinutes: spec.enoughPullTimeoutMinutes }),
      setup(),
    );

    assert.deepEqual(violations, []);
  });

  test(`flags a ${spec.job} job pulling ${spec.label} whose ${spec.testsScript} step sets no time limit`, () => {
    const violations = findPrePulledJobTimeoutViolations(
      jobWithPull(spec, { testsTimeoutMinutes: null }),
    );

    assertSingleViolation(
      violations,
      new RegExp(`${spec.job} job's ${spec.testsScript} step sets no timeout-minutes`),
    );
  });

  test(`flags a ${spec.job} job whose time limit ends before pulling ${spec.label} and running its tests can`, () => {
    const shortMinutes = spec.jobTimeoutMinutes - 1;
    const violations = findPrePulledJobTimeoutViolations(
      jobWithPull(spec, { jobTimeoutMinutes: shortMinutes }),
    );

    assertSingleViolation(
      violations,
      new RegExp(
        `${spec.job} job allows ${shortMinutes} minutes, less than the ${spec.jobSeconds} seconds its image pulls and its ${spec.testsScript} step can take`,
      ),
    );
  });

  test(`passes a ${spec.job} job whose time limit covers pulling ${spec.label} and running its tests`, () => {
    const violations = findPrePulledJobTimeoutViolations(jobWithPull(spec));

    assert.deepEqual(violations, []);
  });

  for (const [label, extra, pattern] of [
    ["only runs under its own condition", "if: false", /in a step that has its own if/],
    ["is allowed to fail", "continue-on-error: true", /in a step that sets continue-on-error/],
    ["runs under its own shell", "shell: sh", /in a step that sets its own shell/],
  ]) {
    test(`flags a pull step of ${spec.label} that ${label}`, () => {
      const violations = spec.findViolations(
        jobWithPull(spec, { pullStepExtra: [extra] }),
        setup(),
      );

      assertSingleViolation(violations, pattern);
    });
  }

  test(`flags a ${spec.testsScript} step that still needs Testcontainers' Ryuk image from Docker Hub`, () => {
    const violations = spec.findViolations(jobWithPull(spec, { testsEnv: {} }), setup());

    assertSingleViolation(violations, /TESTCONTAINERS_RYUK_DISABLED/);
  });

  for (const image of spec.mirror.notOnGhcrImages) {
    test(`flags ${spec.label} started from \`${image}\`, a registry verify.yml does not sign in to`, () => {
      const violations = violationsWithMirror(spec, {}, { pulledImage: image });

      assertSingleViolation(violations, /is not on ghcr\.io/);
    });
  }

  test(`flags a ${spec.job} job that pulls ${spec.label} without signing in to ghcr.io first`, () => {
    const violations = violationsWithMirror(spec, { signIn: "docker login ghcr.io" });

    assertSingleViolation(
      violations,
      new RegExp(`${spec.job} job does not sign in to ghcr\\.io with its own token`),
    );
  });

  test(`flags a ${spec.job} job that signs in to ghcr.io with a token other than its own`, () => {
    const violations = violationsWithMirror(spec, { signInToken: `\${{ secrets.GHCR_TOKEN }}` });

    assertSingleViolation(
      violations,
      new RegExp(`${spec.job} job does not sign in to ghcr\\.io with its own token`),
    );
  });

  test(`flags a ${spec.job} job that signs in to ghcr.io only after pulling ${spec.label}`, () => {
    const violations = spec.findViolations(
      jobWithPull(spec, { signInAfterPull: true }),
      setupDeclaring(spec.constant, spec.image),
    );

    assertSingleViolation(
      violations,
      new RegExp(`${spec.job} job does not sign in to ghcr\\.io with its own token before pulling`),
    );
  });

  test(`flags a ${spec.job} job not granted packages: read, which signing in to ghcr.io needs`, () => {
    const violations = violationsWithMirror(spec, { consumerPermissions: ["contents: read"] });

    assertSingleViolation(violations, new RegExp(`${spec.job} job is not granted packages: read`));
  });

  for (const needs of [
    ["scope", spec.mirror.lookupJob],
    ["scope", spec.mirror.copyJob],
  ]) {
    test(`flags a ${spec.job} job that needs only ${needs.join(" and ")}, not both mirror jobs`, () => {
      const violations = violationsWithMirror(spec, { consumerNeeds: needs });

      assertSingleViolation(
        violations,
        new RegExp(
          `${spec.job} job does not wait for the ${spec.mirror.lookupJob} and ${spec.mirror.copyJob} jobs`,
        ),
      );
    });
  }
}

test("flags a tests job whose time limit covers each image it pulls but not both", () => {
  const violations = findPrePulledJobTimeoutViolations(
    jobWithPull(PLAYWRIGHT_TESTS_SPEC, { alsoPulls: [POSTGRES_SPEC], jobTimeoutMinutes: 46 }),
  );

  assertSingleViolation(
    violations,
    /tests job allows 46 minutes, less than the 2790 seconds its image pulls and its verify:tests step can take/,
  );
});

test("passes a tests job whose time limit covers pulling both images and running its tests", () => {
  const violations = findPrePulledJobTimeoutViolations(
    jobWithPull(PLAYWRIGHT_TESTS_SPEC, { alsoPulls: [POSTGRES_SPEC], jobTimeoutMinutes: 47 }),
  );

  assert.deepEqual(violations, []);
});

test("flags a Playwright image whose tag is not the installed Playwright version", () => {
  const violations = violationsWithMirror(
    PLAYWRIGHT_VISUAL_SPEC,
    {},
    { pulledImage: PLAYWRIGHT_MIRROR.otherImage },
  );

  assertSingleViolation(violations, /not the installed Playwright version 1\.63\.0/);
});

for (const spec of MIRRORED_IMAGES) {
  const { lookupJob, copyJob } = spec.mirror;

  for (const [label, permissions] of [
    ["packages: write", ["packages: write"]],
    ["contents: write besides packages: read", ["packages: read", "contents: write"]],
  ]) {
    test(`flags a ${lookupJob} job granted ${label}, which a read-only token cannot get`, () => {
      const violations = violationsWithMirror(spec, { lookupPermissions: permissions });

      assertSingleViolation(
        violations,
        new RegExp(`${lookupJob} job must be granted only packages: read`),
      );
    });
  }

  test(`flags a ${lookupJob} job that does not look the mirrored image up on ghcr.io`, () => {
    const violations = violationsWithMirror(spec, {
      lookupLines: ['echo "mirrored=true" >> "$GITHUB_OUTPUT"'],
    });

    assertSingleViolation(violations, new RegExp(`${lookupJob} job does not look up`));
  });

  test(`flags a ${lookupJob} job that looks up another image than the global setup starts`, () => {
    const violations = violationsWithMirror(spec, { mirroredImage: spec.mirror.otherImage });

    assert.equal(violations.length, 2, violations.join("\n"));
    assert.match(violations[0], new RegExp(`${lookupJob} job does not look up`));
    assert.match(violations[1], new RegExp(`${copyJob} job does not copy`));
  });

  test(`flags a ${lookupJob} job whose lookup step is not the mirror step its output reads`, () => {
    const violations = violationsWithMirror(spec, { lookupStepId: "lookup" });

    assertSingleViolation(violations, new RegExp(`${lookupJob} job does not look up`));
  });

  test(`flags a ${lookupJob} job that looks the mirrored image up with a token other than its own`, () => {
    const violations = violationsWithMirror(spec, { lookupToken: `\${{ secrets.GHCR_TOKEN }}` });

    assertSingleViolation(violations, new RegExp(`${lookupJob} job does not look up`));
  });

  test(`flags a ${lookupJob} job that does not report what its lookup found`, () => {
    const violations = violationsWithMirror(spec, { lookupOutput: "true" });

    assertSingleViolation(violations, new RegExp(`${lookupJob} job does not look up`));
  });

  test(`flags a ${copyJob} job that copies even when the mirrored image is already there`, () => {
    const violations = violationsWithMirror(spec, { copyCondition: `\${{ !cancelled() }}` });

    assertSingleViolation(violations, new RegExp(`${copyJob} job does not run only when`));
  });

  test(`flags a ${copyJob} job that does not wait for the lookup it depends on`, () => {
    const violations = violationsWithMirror(spec, { copyNeeds: ["scope"] });

    assertSingleViolation(violations, new RegExp(`${copyJob} job does not run only when`));
  });

  test(`flags a ${copyJob} job that copies with a token other than its own`, () => {
    const violations = violationsWithMirror(spec, { copyToken: `\${{ secrets.GHCR_TOKEN }}` });

    assertSingleViolation(
      violations,
      new RegExp(`${copyJob} job does not copy .* with its own token`),
    );
  });

  for (const [label, timeouts] of [
    ["job", { copyJobTimeoutMinutes: 10 }],
    ["step", { copyStepTimeoutMinutes: 10 }],
  ]) {
    test(`flags a ${copyJob} ${label} whose time limit ends before its last copy attempt can`, () => {
      const violations = violationsWithMirror(spec, timeouts);

      assertSingleViolation(
        violations,
        new RegExp(
          `${copyJob} ${label} allows 10 minutes, less than the ${spec.mirror.copyRetrySeconds} seconds its copy attempts and their delays can take`,
        ),
      );
    });
  }

  test(`passes a ${copyJob} step whose time limit covers every copy attempt and delay`, () => {
    const violations = violationsWithMirror(spec, {
      copyStepTimeoutMinutes: spec.mirror.enoughCopyStepTimeoutMinutes,
    });

    assert.deepEqual(violations, []);
  });

  test(`flags a ${copyJob} job not granted packages: write`, () => {
    const violations = violationsWithMirror(spec, { copyPermissions: ["packages: read"] });

    assertSingleViolation(violations, new RegExp(`${copyJob} job is not granted packages: write`));
  });

  test(`flags a ${copyJob} job that copies once, without retrying`, () => {
    const violations = violationsWithMirror(spec, {
      copyLines: [
        `skopeo copy --all --preserve-digests "docker://$SOURCE_IMAGE" "docker://\${${spec.constant}%@*}"`,
      ],
    });

    assertSingleViolation(violations, new RegExp(`${copyJob} job does not copy`));
  });

  test(`flags a ${copyJob} job whose copy attempt has another time limit than the one its job allows for`, () => {
    const violations = violationsWithMirror(spec, {
      copyLines: copyMirrorLines(spec.constant, 30),
    });

    assertSingleViolation(violations, new RegExp(`${copyJob} job does not copy`));
  });

  test(`flags a ${copyJob} job whose source is another digest than the mirrored image`, () => {
    const violations = violationsWithMirror(spec, {
      sourceImage: spec.mirror.otherDigestSourceImage,
    });

    assertSingleViolation(
      violations,
      new RegExp(`${copyJob} job copies \`[^\`]+\`, not the digest`),
    );
  });

  test(`flags a ${copyJob} job that copies from Docker Hub, whose unauthenticated pulls a shared runner can exhaust`, () => {
    const violations = violationsWithMirror(spec, {
      sourceImage: spec.mirror.dockerHubSourceImage,
    });

    assertSingleViolation(violations, new RegExp(`${copyJob} job copies .* from Docker Hub`));
  });
}

function composeDeclaring(dbImage) {
  return [
    "services:",
    "  db:",
    ...(dbImage === undefined ? [] : [`    image: ${dbImage}`]),
    "    ports:",
    '      - "5432:5432"',
  ].join("\n");
}

test("passes a local database that starts the same Postgres image as the cloud's tests", () => {
  const violations = findLocalPostgresImageViolations(
    composeDeclaring(PINNED_POSTGRES_IMAGE),
    setupDeclaring("POSTGRES_IMAGE", PINNED_POSTGRES_IMAGE),
  );

  assert.deepEqual(violations, []);
});

for (const [label, dbImage] of [
  ["a tag alone", "public.ecr.aws/docker/library/postgres:18-alpine"],
  ["Docker Hub's name for it", `postgres:18-alpine@${POSTGRES_DIGEST}`],
  ["no image at all", undefined],
]) {
  test(`flags a local database that starts ${label} instead of the cloud tests' Postgres image`, () => {
    const violations = findLocalPostgresImageViolations(
      composeDeclaring(dbImage),
      setupDeclaring("POSTGRES_IMAGE", PINNED_POSTGRES_IMAGE),
    );

    assertSingleViolation(violations, /docker-compose\.yml's db service starts/);
  });
}

test("leaves a global setup with no POSTGRES_IMAGE to the cloud Postgres check instead of comparing the local database with it", () => {
  const violations = findLocalPostgresImageViolations(
    composeDeclaring(PINNED_POSTGRES_IMAGE),
    'const IMAGE = "postgres";',
  );

  assert.deepEqual(violations, []);
});

test("checkRepository reads the real workflow file, package.json, the local database, both image setups and the installed Playwright version", () => {
  const files = {
    ".github/workflows/verify.yml": jobWithPull(PRE_PULLED_IMAGES[0]),
    "package.json": packageJson(),
    "docker-compose.yml": composeDeclaring(PINNED_POSTGRES_IMAGE),
    "apps/cloud/vitest.global-setup.postgres.ts": setupDeclaring(
      "POSTGRES_IMAGE",
      PINNED_POSTGRES_IMAGE,
    ),
    "vitest.global-setup.playwright-server.ts": setupDeclaring(
      "PLAYWRIGHT_SERVER_IMAGE",
      PINNED_PLAYWRIGHT_IMAGE,
    ),
    "node_modules/playwright/package.json": JSON.stringify({
      version: INSTALLED_PLAYWRIGHT_VERSION,
    }),
  };
  const read = [];

  checkRepository({
    readFile: (path) => {
      read.push(path);
      return files[path];
    },
  });

  assert.deepEqual(read.sort(), Object.keys(files).sort());
});

function workflowWithStep(runLine) {
  return [
    "jobs:",
    "  tests:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - run: pnpm install --frozen-lockfile",
    `      - run: ${runLine}`,
    "      - run: pnpm verify:tests",
  ].join("\n");
}

for (const command of [
  "pnpm exec playwright install chromium",
  "pnpm exec playwright install --with-deps chromium",
  "pnpm exec playwright install-deps chromium",
  "npx playwright install",
  "npx playwright@1.63.0 install --with-deps chromium",
  "pnpm dlx playwright@latest install-deps",
  "playwright-core install",
]) {
  test(`flags a step that runs \`${command}\``, () => {
    const violations = findPlaywrightInstallViolations(workflowWithStep(command));

    assertSingleViolation(violations, /apt mirror can stall the step silently/);
  });
}

test("passes a workflow whose steps never install a Playwright browser or its system packages", () => {
  const violations = findPlaywrightInstallViolations(workflowWithStep("pnpm verify:tests"));

  assert.deepEqual(violations, []);
});

test("the real Verify workflow runs every part of pnpm verify", () => {
  const violations = checkRepository();

  assert.deepEqual(violations, []);
});
