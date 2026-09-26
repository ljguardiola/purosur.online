// Proves that .github/workflows/verify.yml actually runs every part of `pnpm verify`, so an edit
// to the workflow (or to package.json's scripts) that silently drops a check from CI fails this
// guard instead of just quietly shipping a weaker merge gate.

import { readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";

const WORKFLOW_PATH = ".github/workflows/verify.yml";
const PACKAGE_JSON_PATH = "package.json";
const EXPECTED_VERIFY_SCRIPT = "pnpm verify:static && pnpm verify:tests";

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

function jobNode(doc, jobId) {
  // doc.get proxies to the document's root node; the root is not itself a Map instance, so
  // mapGet (which checks isMap) cannot be used for this one top-level lookup.
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  return mapGet(doc, jobsNode, jobId);
}

function stepRunCommands(doc, job) {
  const stepsNode = resolveNode(doc, mapGet(doc, job, "steps"));
  if (!isSeq(stepsNode)) return [];

  return stepsNode.items
    .map((stepItem) => resolveNode(doc, stepItem))
    .map((stepNode) => resolveScalar(doc, mapGet(doc, stepNode, "run")))
    .filter((run) => typeof run === "string");
}

/** Whether any step in the job runs the given pnpm script, as `pnpm <script>` or `pnpm run <script>`. */
function jobRunsPnpmScript(doc, job, scriptName) {
  const pattern = new RegExp(`(^|\\s)pnpm\\s+(run\\s+)?${scriptName}(\\s|$)`);
  return stepRunCommands(doc, job).some((run) => pattern.test(run));
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

/** Whether a step in the job runs the given pnpm script with `--shard=${{ matrix.shard }}/<shardCount>`. */
function jobRunsShardedPnpmScript(doc, job, scriptName, shardCount) {
  const pattern = new RegExp(
    `(^|\\s)pnpm\\s+(run\\s+)?${scriptName}\\b.*--shard=\\$\\{\\{\\s*matrix\\.shard\\s*\\}\\}/${shardCount}(\\s|$)`,
  );
  return stepRunCommands(doc, job).some((run) => pattern.test(run));
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
  } else if (!jobRunsPnpmScript(doc, staticJob, "verify:static")) {
    violations.push("verify.yml's static job does not run pnpm verify:static");
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
    } else if (!jobRunsShardedPnpmScript(doc, testsJob, "verify:tests", shardValues.length)) {
      violations.push(
        `verify.yml's tests job does not run pnpm verify:tests --shard=\${{ matrix.shard }}/${shardValues.length} for every shard`,
      );
    }
  }

  const packageJson = JSON.parse(packageJsonSource);
  if (packageJson.scripts?.verify !== EXPECTED_VERIFY_SCRIPT) {
    violations.push(
      `package.json's "verify" script is "${packageJson.scripts?.verify}", expected the exact composition "${EXPECTED_VERIFY_SCRIPT}"`,
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
