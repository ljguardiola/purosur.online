// Proves that .github/workflows/verify.yml still runs the parts of `pnpm verify` and lets a
// failure of any of them reach the required verify check: the static and tests jobs run under the
// expected condition, neither they nor their verify step may continue on error, each runs its
// exact pnpm command over a complete shard range, the verify job needs both, and package.json's
// scripts still compose tsc, biome, dependency-cruiser, the automation tests and vitest without
// swallowing a failure. An edit that breaks any of these fails this guard instead of quietly
// shipping a weaker merge gate.

import { readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";

const WORKFLOW_PATH = ".github/workflows/verify.yml";
const PACKAGE_JSON_PATH = "package.json";
const EXPECTED_VERIFY_SCRIPT = "pnpm verify:static && pnpm verify:tests";
const EXPECTED_VERIFY_TESTS_SCRIPT = "vitest run";
const REQUIRED_VERIFY_STATIC_COMMANDS = [
  "tsc --noEmit",
  "biome ci .",
  "pnpm depcruise",
  "node --test .github/scripts/*.test.mjs",
];
const EXPECTED_RUN_CONDITION =
  "${{ !cancelled() && (github.event_name != 'pull_request' || needs.scope.result != 'success' || needs.scope.outputs.docs_only != 'true') }}";

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
  // doc.get proxies to the document's root node; the root is not itself a Map instance, so
  // mapGet (which checks isMap) cannot be used for this one top-level lookup.
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  return mapGet(doc, jobsNode, jobId);
}

function steps(doc, job) {
  const stepsNode = resolveNode(doc, mapGet(doc, job, "steps"));
  if (!isSeq(stepsNode)) return [];
  return stepsNode.items.map((stepItem) => resolveNode(doc, stepItem));
}

/** The first step whose `run` is exactly the given command, or undefined. */
function stepRunningExactly(doc, job, command) {
  return steps(doc, job).find((step) => {
    const run = resolveScalar(doc, mapGet(doc, step, "run"));
    return typeof run === "string" && run.trim() === command;
  });
}

/** Whether the node sets `continue-on-error` to anything other than false. */
function mayContinueOnError(doc, node) {
  return (
    mapHas(doc, node, "continue-on-error") &&
    resolveScalar(doc, mapGet(doc, node, "continue-on-error")) !== false
  );
}

/** The job's `strategy.matrix.shard` values, or null when that path is not a sequence. */
function matrixShardValues(doc, job) {
  const strategyNode = resolveNode(doc, mapGet(doc, job, "strategy"));
  const matrixNode = resolveNode(doc, mapGet(doc, strategyNode, "matrix"));
  const shardNode = resolveNode(doc, mapGet(doc, matrixNode, "shard"));
  if (!isSeq(shardNode)) return null;
  return shardNode.items.map((item) => Number(resolveScalar(doc, item)));
}

/** Whether values are exactly 1..n, each appearing exactly once, regardless of order. */
function isContiguousShardRange(values) {
  if (values === null || values.length === 0) return false;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index + 1);
}

/** The job ids a job's `needs` names, whether written as one id or a list. */
function neededJobs(doc, job) {
  const needsNode = resolveNode(doc, mapGet(doc, job, "needs"));
  if (isSeq(needsNode)) return needsNode.items.map((item) => resolveScalar(doc, item));
  const single = resolveScalar(doc, needsNode);
  return typeof single === "string" ? [single] : [];
}

/** Violations for a job that must run under the expected condition and a step running `command`. */
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
  return violations;
}

/** Whether the script is `&&`-joined plain commands that include every required one. */
function composesEveryCommand(script, requiredCommands) {
  if (typeof script !== "string") return false;
  const commands = script.split("&&").map((command) => command.trim());
  const everyCommandPropagatesFailure = commands.every(
    (command) => command !== "" && !/[|;&`]|\$\(/.test(command),
  );
  return (
    everyCommandPropagatesFailure &&
    requiredCommands.every((required) => commands.includes(required))
  );
}

/** @returns {string[]} one violation per way the workflow or package.json no longer runs every
 * part of `pnpm verify`; an empty array means the composition is intact. */
export function findVerifyWorkflowViolations(workflowSource, packageJsonSource) {
  const doc = parseDocument(workflowSource);
  if (doc.errors.length > 0) {
    return [`verify.yml does not parse as YAML: ${doc.errors[0].message}`];
  }

  const violations = [];

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
    const needs = neededJobs(doc, verifyJob);
    for (const jobId of ["static", "tests"]) {
      if (!needs.includes(jobId)) {
        violations.push(`verify.yml's verify job does not need ${jobId}`);
      }
    }
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

/** @returns {string[]} findVerifyWorkflowViolations against the real repository files. */
export function checkRepository({
  readFile = (path) => readFileSync(path, "utf8"),
  workflowPath = WORKFLOW_PATH,
  packageJsonPath = PACKAGE_JSON_PATH,
} = {}) {
  return findVerifyWorkflowViolations(readFile(workflowPath), readFile(packageJsonPath));
}
