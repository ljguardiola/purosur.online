import { readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";

const WORKFLOW_PATH = ".github/workflows/verify.yml";
const PACKAGE_JSON_PATH = "package.json";
const CLOUD_POSTGRES_SETUP_PATH = "apps/cloud/vitest.global-setup.postgres.ts";
const PULL_WITH_RETRIES_COMMAND = [
  "for delay in 0 15 30 60; do",
  '  sleep "$delay"',
  '  timeout 120 docker pull "$POSTGRES_IMAGE" && exit 0',
  "done",
  "exit 1",
].join("\n");
const EXPECTED_VERIFY_SCRIPT = "pnpm verify:static && pnpm verify:tests && pnpm verify:visual";
const EXPECTED_VERIFY_TESTS_SCRIPT = "vitest run --project='!catalog-visual'";
const EXPECTED_VERIFY_VISUAL_SCRIPT = "vitest run --project=catalog-visual";
const REQUIRED_VERIFY_STATIC_COMMANDS = [
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
  "node --test .github/scripts/*.test.mjs",
];
const EXPECTED_RUN_CONDITION = `\${{ !cancelled() && (github.event_name != 'pull_request' || needs.scope.result != 'success' || needs.scope.outputs.docs_only != 'true') }}`;
const EXPECTED_VISUAL_CONDITION = `\${{ !cancelled() && needs.scope.outputs.catalog_changed != 'false' }}`;
const EXPECTED_VERIFY_CONDITION = "always()";
const HISTORY_SCAN_COMMAND = "node --test .github/scripts/no-secrets-in-commit-history.test.mjs";
const EXPECTED_HISTORY_SCAN_BASE_REF = `\${{ github.event.pull_request.base.sha }}`;
const AGGREGATE_COMMAND = "node .github/scripts/aggregate-verify-result.mjs";
const EXPECTED_AGGREGATE_ENV = {
  EVENT_NAME: `\${{ github.event_name }}`,
  SCOPE_RESULT: `\${{ needs.scope.result }}`,
  SCOPE_DOCS_ONLY: `\${{ needs.scope.outputs.docs_only }}`,
  SCOPE_CATALOG_CHANGED: `\${{ needs.scope.outputs.catalog_changed }}`,
  STATIC_RESULT: `\${{ needs.static.result }}`,
  TESTS_RESULT: `\${{ needs.tests.result }}`,
  VISUAL_RESULT: `\${{ needs.visual.result }}`,
};

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : resolved;
}

function mapGet(doc, mapNode, key) {
  const resolved = resolveNode(doc, mapNode);
  return isMap(resolved) ? resolved.get(key, true) : undefined;
}

function mapHas(doc, mapNode, key) {
  const resolved = resolveNode(doc, mapNode);
  return isMap(resolved) && resolved.has(key);
}

function jobNode(doc, jobId) {
  // The yaml package's Document root proxies .get() but is not itself a Map instance, so mapGet
  // (which checks isMap) cannot be used for this one top-level lookup.
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  return mapGet(doc, jobsNode, jobId);
}

function steps(doc, job) {
  const stepsNode = resolveNode(doc, mapGet(doc, job, "steps"));
  if (!isSeq(stepsNode)) return [];
  return stepsNode.items.map((stepItem) => resolveNode(doc, stepItem));
}

function stepRunningExactly(doc, job, command) {
  return steps(doc, job).find((step) => {
    const run = resolveScalar(doc, mapGet(doc, step, "run"));
    return typeof run === "string" && run.trim() === command;
  });
}

function mayContinueOnError(doc, node) {
  return (
    mapHas(doc, node, "continue-on-error") &&
    resolveScalar(doc, mapGet(doc, node, "continue-on-error")) !== false
  );
}

function matrixNode(doc, job) {
  const strategyNode = resolveNode(doc, mapGet(doc, job, "strategy"));
  return resolveNode(doc, mapGet(doc, strategyNode, "matrix"));
}

function matrixShardValues(doc, job) {
  const shardNode = resolveNode(doc, mapGet(doc, matrixNode(doc, job), "shard"));
  if (!isSeq(shardNode)) return null;
  return shardNode.items.map((item) => Number(resolveScalar(doc, item)));
}

function isContiguousShardRange(values) {
  if (values === null || values.length === 0) return false;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index + 1);
}

// GitHub Actions' `needs:` accepts either a single job id or a list of them.
function neededJobs(doc, job) {
  const needsNode = resolveNode(doc, mapGet(doc, job, "needs"));
  if (isSeq(needsNode)) return needsNode.items.map((item) => resolveScalar(doc, item));
  const single = resolveScalar(doc, needsNode);
  return typeof single === "string" ? [single] : [];
}

function runnerJobViolations(doc, jobId, job, command, expectedCondition) {
  const violations = [];

  const condition = resolveScalar(doc, mapGet(doc, job, "if"));
  if (condition !== expectedCondition) {
    violations.push(
      `verify.yml's ${jobId} job runs under \`if: ${condition}\`, expected \`if: ${expectedCondition}\``,
    );
  }
  if (mayContinueOnError(doc, job)) {
    violations.push(`verify.yml's ${jobId} job sets continue-on-error`);
  }
  if (mapHas(doc, job, "defaults")) {
    violations.push(`verify.yml's ${jobId} job sets defaults`);
  }

  const step = stepRunningExactly(doc, job, command);
  if (step === undefined) {
    violations.push(`verify.yml's ${jobId} job has no step whose run is exactly \`${command}\``);
    return violations;
  }
  if (mayContinueOnError(doc, step)) {
    violations.push(`verify.yml's ${jobId} job's verify:${jobId} step sets continue-on-error`);
  }
  if (mapHas(doc, step, "if")) {
    violations.push(`verify.yml's ${jobId} job's verify:${jobId} step has its own if`);
  }
  if (mapHas(doc, step, "shell")) {
    violations.push(`verify.yml's ${jobId} job's verify:${jobId} step sets its own shell`);
  }
  return violations;
}

// Scope runs even when static and tests are skipped for a docs-only change, whose net diff can hide
// a secret one of its commits added and a later one removed.
function scopeJobViolations(doc, job) {
  const violations = [];

  if (mayContinueOnError(doc, job)) {
    violations.push("verify.yml's scope job sets continue-on-error");
  }
  if (mapHas(doc, job, "defaults")) {
    violations.push("verify.yml's scope job sets defaults");
  }

  const step = stepRunningExactly(doc, job, HISTORY_SCAN_COMMAND);
  if (step === undefined) {
    violations.push(
      `verify.yml's scope job has no step whose run is exactly \`${HISTORY_SCAN_COMMAND}\``,
    );
    return violations;
  }
  if (mayContinueOnError(doc, step)) {
    violations.push("verify.yml's scope job's commit history scan step sets continue-on-error");
  }
  if (mapHas(doc, step, "if")) {
    violations.push("verify.yml's scope job's commit history scan step has its own if");
  }
  if (mapHas(doc, step, "shell")) {
    violations.push("verify.yml's scope job's commit history scan step sets its own shell");
  }
  const baseRef = resolveScalar(doc, mapGet(doc, mapGet(doc, step, "env"), "CHANGE_BASE_REF"));
  if (baseRef !== EXPECTED_HISTORY_SCAN_BASE_REF) {
    violations.push(
      `verify.yml's scope job's commit history scan step's CHANGE_BASE_REF is \`${baseRef}\`, expected \`${EXPECTED_HISTORY_SCAN_BASE_REF}\``,
    );
  }
  return violations;
}

function verifyJobViolations(doc, job) {
  const violations = [];

  const needs = neededJobs(doc, job);
  for (const jobId of ["static", "tests", "visual"]) {
    if (!needs.includes(jobId)) {
      violations.push(`verify.yml's verify job does not need ${jobId}`);
    }
  }

  const condition = resolveScalar(doc, mapGet(doc, job, "if"));
  if (condition !== EXPECTED_VERIFY_CONDITION) {
    violations.push(
      `verify.yml's verify job runs under \`if: ${condition}\`, expected \`if: ${EXPECTED_VERIFY_CONDITION}\``,
    );
  }
  if (mayContinueOnError(doc, job)) {
    violations.push("verify.yml's verify job sets continue-on-error");
  }
  if (mapHas(doc, job, "defaults")) {
    violations.push("verify.yml's verify job sets defaults");
  }

  const step = stepRunningExactly(doc, job, AGGREGATE_COMMAND);
  if (step === undefined) {
    violations.push(
      `verify.yml's verify job has no step whose run is exactly \`${AGGREGATE_COMMAND}\``,
    );
    return violations;
  }
  if (mayContinueOnError(doc, step)) {
    violations.push("verify.yml's verify job's aggregate step sets continue-on-error");
  }
  if (mapHas(doc, step, "if")) {
    violations.push("verify.yml's verify job's aggregate step has its own if");
  }
  if (mapHas(doc, step, "shell")) {
    violations.push("verify.yml's verify job's aggregate step sets its own shell");
  }
  const envNode = mapGet(doc, step, "env");
  for (const [name, expected] of Object.entries(EXPECTED_AGGREGATE_ENV)) {
    const actual = resolveScalar(doc, mapGet(doc, envNode, name));
    if (actual !== expected) {
      violations.push(
        `verify.yml's verify job's aggregate step's ${name} is \`${actual}\`, expected \`${expected}\``,
      );
    }
  }
  return violations;
}

function composesEveryCommand(script, requiredCommands) {
  if (typeof script !== "string") return false;
  const commands = script.split("&&").map((command) => command.trim());
  const everyCommandPropagatesFailure = commands.every(
    (command) => command !== "" && !/[|;&`#\n\r]|\$\(/.test(command),
  );
  return (
    everyCommandPropagatesFailure &&
    requiredCommands.every((required) => commands.includes(required))
  );
}

export function findVerifyWorkflowViolations(workflowSource, packageJsonSource) {
  const doc = parseDocument(workflowSource);
  if (doc.errors.length > 0) {
    return [`verify.yml does not parse as YAML: ${doc.errors[0].message}`];
  }

  const violations = [];

  if (mapHas(doc, doc.contents, "defaults")) {
    violations.push("verify.yml sets workflow-level defaults");
  }

  const scopeJob = jobNode(doc, "scope");
  if (scopeJob === undefined) {
    violations.push("verify.yml has no scope job");
  } else {
    violations.push(...scopeJobViolations(doc, scopeJob));
  }

  const staticJob = jobNode(doc, "static");
  if (staticJob === undefined) {
    violations.push("verify.yml has no static job");
  } else {
    violations.push(
      ...runnerJobViolations(
        doc,
        "static",
        staticJob,
        "pnpm verify:static",
        EXPECTED_RUN_CONDITION,
      ),
    );
  }

  const testsJob = jobNode(doc, "tests");
  if (testsJob === undefined) {
    violations.push("verify.yml has no tests job");
  } else {
    for (const key of ["exclude", "include"]) {
      if (mapHas(doc, matrixNode(doc, testsJob), key)) {
        violations.push(`verify.yml's tests job strategy.matrix sets ${key}`);
      }
    }
    const shardValues = matrixShardValues(doc, testsJob);
    if (!isContiguousShardRange(shardValues)) {
      violations.push(
        "verify.yml's tests job strategy.matrix.shard is not a contiguous 1..n range covering every shard once",
      );
    } else {
      violations.push(
        ...runnerJobViolations(
          doc,
          "tests",
          testsJob,
          `pnpm verify:tests --shard=\${{ matrix.shard }}/${shardValues.length}`,
          EXPECTED_RUN_CONDITION,
        ),
      );
    }
  }

  const visualJob = jobNode(doc, "visual");
  if (visualJob === undefined) {
    violations.push("verify.yml has no visual job");
  } else {
    violations.push(
      ...runnerJobViolations(
        doc,
        "visual",
        visualJob,
        "pnpm verify:visual",
        EXPECTED_VISUAL_CONDITION,
      ),
    );
  }

  const verifyJob = jobNode(doc, "verify");
  if (verifyJob === undefined) {
    violations.push("verify.yml has no verify job");
  } else {
    violations.push(...verifyJobViolations(doc, verifyJob));
  }

  const scripts = JSON.parse(packageJsonSource).scripts;
  if (scripts?.verify !== EXPECTED_VERIFY_SCRIPT) {
    violations.push(
      `package.json's "verify" script is "${scripts?.verify}", expected the exact composition "${EXPECTED_VERIFY_SCRIPT}"`,
    );
  }
  if (!composesEveryCommand(scripts?.["verify:static"], REQUIRED_VERIFY_STATIC_COMMANDS)) {
    violations.push(
      `package.json's "verify:static" script is "${scripts?.["verify:static"]}", expected plain commands joined by && that include ${REQUIRED_VERIFY_STATIC_COMMANDS.map((command) => `"${command}"`).join(", ")}`,
    );
  }
  if (scripts?.["verify:tests"] !== EXPECTED_VERIFY_TESTS_SCRIPT) {
    violations.push(
      `package.json's "verify:tests" script is "${scripts?.["verify:tests"]}", expected exactly "${EXPECTED_VERIFY_TESTS_SCRIPT}"`,
    );
  }
  if (scripts?.["verify:visual"] !== EXPECTED_VERIFY_VISUAL_SCRIPT) {
    violations.push(
      `package.json's "verify:visual" script is "${scripts?.["verify:visual"]}", expected exactly "${EXPECTED_VERIFY_VISUAL_SCRIPT}"`,
    );
  }

  return violations;
}

// Testcontainers pulls an image the runner does not have yet with a single attempt, so a slow
// registry would fail the whole shard; the tests job pulls it first, retrying.
export function findCloudPostgresImageViolations(workflowSource, postgresSetupSource) {
  const image = /const POSTGRES_IMAGE =\s*"([^"]+)";/.exec(postgresSetupSource)?.[1];
  if (image === undefined) {
    return [`${CLOUD_POSTGRES_SETUP_PATH} declares no POSTGRES_IMAGE`];
  }

  const violations = [];
  if (!/@sha256:[0-9a-f]{64}$/.test(image)) {
    violations.push(`the cloud's Postgres image \`${image}\` is not pinned by digest`);
  }

  const doc = parseDocument(workflowSource);
  const testsJob = jobNode(doc, "tests");
  const testsSteps = steps(doc, testsJob);
  const testsIndex = testsSteps.findIndex((step) => {
    const run = resolveScalar(doc, mapGet(doc, step, "run"));
    return typeof run === "string" && run.trim().startsWith("pnpm verify:tests");
  });
  const pullStep = testsSteps.slice(0, Math.max(testsIndex, 0)).find((step) => {
    const run = resolveScalar(doc, mapGet(doc, step, "run"));
    return typeof run === "string" && run.trim() === PULL_WITH_RETRIES_COMMAND;
  });

  if (pullStep === undefined) {
    violations.push(
      "verify.yml's tests job has no step that pulls the cloud's Postgres image with retries before its verify:tests step",
    );
  } else {
    const pulled = resolveScalar(doc, mapGet(doc, mapGet(doc, pullStep, "env"), "POSTGRES_IMAGE"));
    if (pulled !== image) {
      violations.push(
        `verify.yml's tests job pulls \`${pulled}\`, but the cloud's tests start \`${image}\``,
      );
    }
    if (mayContinueOnError(doc, pullStep)) {
      violations.push("verify.yml's tests job's Postgres pull step sets continue-on-error");
    }
    if (mapHas(doc, pullStep, "if")) {
      violations.push("verify.yml's tests job's Postgres pull step has its own if");
    }
    if (mapHas(doc, pullStep, "shell")) {
      violations.push("verify.yml's tests job's Postgres pull step sets its own shell");
    }
  }

  // Ryuk is another image Testcontainers pulls from Docker Hub; a runner is discarded after its
  // job, so there is nothing left for it to clean up.
  const ryukDisabled = resolveScalar(
    doc,
    mapGet(doc, mapGet(doc, testsSteps[testsIndex], "env"), "TESTCONTAINERS_RYUK_DISABLED"),
  );
  if (String(ryukDisabled) !== "true") {
    violations.push(
      "verify.yml's tests job's verify:tests step does not set TESTCONTAINERS_RYUK_DISABLED to true",
    );
  }
  return violations;
}

export function checkRepository({
  readFile = (path) => readFileSync(path, "utf8"),
  workflowPath = WORKFLOW_PATH,
  packageJsonPath = PACKAGE_JSON_PATH,
  postgresSetupPath = CLOUD_POSTGRES_SETUP_PATH,
} = {}) {
  const workflowSource = readFile(workflowPath);
  return [
    ...findVerifyWorkflowViolations(workflowSource, readFile(packageJsonPath)),
    ...findCloudPostgresImageViolations(workflowSource, readFile(postgresSetupPath)),
  ];
}
