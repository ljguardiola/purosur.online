import { readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";

const WORKFLOW_PATH = ".github/workflows/verify.yml";
const PACKAGE_JSON_PATH = "package.json";
const EXPECTED_VERIFY_SCRIPT = "pnpm verify:static && pnpm verify:tests && pnpm verify:visual";
const EXPECTED_VERIFY_TESTS_SCRIPT = "vitest run --project='!catalog-visual'";
const REQUIRED_VERIFY_STATIC_COMMANDS = [
  "tsc --noEmit",
  "pnpm --filter @purosur/cloud build",
  "biome ci .",
  "pnpm depcruise",
  "node --test .github/scripts/*.test.mjs",
];
const EXPECTED_RUN_CONDITION = `\${{ !cancelled() && (github.event_name != 'pull_request' || needs.scope.result != 'success' || needs.scope.outputs.docs_only != 'true') }}`;
const EXPECTED_VERIFY_CONDITION = "always()";
const AGGREGATE_COMMAND = "node .github/scripts/aggregate-verify-result.mjs";
const EXPECTED_AGGREGATE_ENV = {
  EVENT_NAME: `\${{ github.event_name }}`,
  SCOPE_RESULT: `\${{ needs.scope.result }}`,
  SCOPE_DOCS_ONLY: `\${{ needs.scope.outputs.docs_only }}`,
  STATIC_RESULT: `\${{ needs.static.result }}`,
  TESTS_RESULT: `\${{ needs.tests.result }}`,
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

function runnerJobViolations(doc, jobId, job, command) {
  const violations = [];

  const condition = resolveScalar(doc, mapGet(doc, job, "if"));
  if (condition !== EXPECTED_RUN_CONDITION) {
    violations.push(
      `verify.yml's ${jobId} job runs under \`if: ${condition}\`, expected \`if: ${EXPECTED_RUN_CONDITION}\``,
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

function verifyJobViolations(doc, job) {
  const violations = [];

  const needs = neededJobs(doc, job);
  for (const jobId of ["static", "tests"]) {
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

  const staticJob = jobNode(doc, "static");
  if (staticJob === undefined) {
    violations.push("verify.yml has no static job");
  } else {
    violations.push(...runnerJobViolations(doc, "static", staticJob, "pnpm verify:static"));
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
        ),
      );
    }
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

  return violations;
}

export function checkRepository({
  readFile = (path) => readFileSync(path, "utf8"),
  workflowPath = WORKFLOW_PATH,
  packageJsonPath = PACKAGE_JSON_PATH,
} = {}) {
  return findVerifyWorkflowViolations(readFile(workflowPath), readFile(packageJsonPath));
}
