import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const CACHE_ACTIONS = ["actions/cache", "actions/cache/restore", "actions/cache/save"];

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

function steps(doc, job) {
  const stepsNode = resolveNode(doc, mapGet(doc, job, "steps"));
  if (!isSeq(stepsNode)) return [];
  return stepsNode.items.map((stepItem) => resolveNode(doc, stepItem));
}

function usesAction(doc, step, action) {
  const uses = resolveScalar(doc, mapGet(doc, step, "uses"));
  return typeof uses === "string" && uses.startsWith(`${action}@`);
}

function setsUpNodeWithCache(doc, step) {
  return mapHas(doc, mapGet(doc, step, "with"), "cache");
}

function hasPositiveTimeout(doc, step) {
  const timeout = resolveScalar(doc, mapGet(doc, step, "timeout-minutes"));
  return typeof timeout === "number" && timeout > 0;
}

function parseWorkflow(source) {
  const lineCounter = new LineCounter();
  return { doc: parseDocument(source, { lineCounter }), lineCounter };
}

function violationsOf({ doc, lineCounter }) {
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  if (!isMap(jobsNode)) return [];

  const violations = [];
  for (const jobPair of jobsNode.items) {
    const jobId = String(resolveScalar(doc, jobPair.key));
    const job = resolveNode(doc, jobPair.value);
    const jobMinutes = resolveScalar(doc, mapGet(doc, job, "timeout-minutes"));
    for (const step of steps(doc, job)) {
      if (!isMap(step)) continue;
      const { line } = lineCounter.linePos(step.range[0]);
      const report = (message) => violations.push({ line, message });

      if (usesAction(doc, step, "actions/setup-node") && setsUpNodeWithCache(doc, step)) {
        report(
          `${jobId} job restores a dependency cache inside actions/setup-node, whose step a stalled download keeps from finishing until the job times out; restore the cache in its own step with timeout-minutes and continue-on-error`,
        );
      }
      const cacheAction = CACHE_ACTIONS.find((action) => usesAction(doc, step, action));
      if (cacheAction === undefined) continue;
      if (!hasPositiveTimeout(doc, step)) {
        report(
          `${jobId} job's ${cacheAction} step sets no timeout-minutes, so a stalled transfer runs until the job times out`,
        );
      } else {
        const stepMinutes = resolveScalar(doc, mapGet(doc, step, "timeout-minutes"));
        if (typeof jobMinutes === "number" && stepMinutes >= jobMinutes) {
          report(
            `${jobId} job's ${cacheAction} step's timeout-minutes (${stepMinutes}) is not shorter than the job's (${jobMinutes}), so a stalled transfer can still run until the job times out`,
          );
        }
      }
      if (resolveScalar(doc, mapGet(doc, step, "continue-on-error")) !== true) {
        report(
          `${jobId} job's ${cacheAction} step does not continue on error, so a stalled transfer fails the job instead of leaving it without the cache`,
        );
      }
    }
  }
  return violations;
}

export function findDependencyCacheViolations(source) {
  return violationsOf(parseWorkflow(source));
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) => {
    const workflow = parseWorkflow(readFile(path));
    if (workflow.doc.errors.length > 0) {
      const [error] = workflow.doc.errors;
      return [
        { path, line: error.linePos[0].line, message: `does not parse as YAML: ${error.message}` },
      ];
    }
    return violationsOf(workflow).map((violation) => ({ path, ...violation }));
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
