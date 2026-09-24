import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const CHECKOUT_ACTION = /^actions\/checkout@/i;
const MISSING_PERSIST_CREDENTIALS = "actions/checkout step has no persist-credentials: false";

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : resolved;
}

// A value set under a step's env: never reaches the action's inputs, so only with: counts.
function persistsCredentialsFalse(doc, stepNode) {
  const withNode = resolveNode(doc, stepNode.get("with", true));
  if (!isMap(withNode)) return false;
  const value = resolveScalar(doc, withNode.get("persist-credentials", true));
  return value === false || value === "false";
}

/** Every `actions/checkout` step across every job in a workflow's YAML source, with its start
 * line (1-indexed) and whether it sets `persist-credentials: false` under `with:`. Resolves YAML
 * aliases wherever `jobs`, a job, `steps`, a step, `uses`, `with` or `persist-credentials` is
 * read, so an aliased checkout step is checked like any other. */
export function findCheckoutSteps(source) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter });
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  if (!isMap(jobsNode)) return [];

  const steps = [];
  for (const jobPair of jobsNode.items) {
    const jobNode = resolveNode(doc, jobPair.value);
    if (!isMap(jobNode)) continue;
    const stepsNode = resolveNode(doc, jobNode.get("steps", true));
    if (!isSeq(stepsNode)) continue;

    for (const stepItem of stepsNode.items) {
      const stepNode = resolveNode(doc, stepItem);
      if (!isMap(stepNode)) continue;
      const uses = resolveScalar(doc, stepNode.get("uses", true));
      if (typeof uses !== "string" || !CHECKOUT_ACTION.test(uses)) continue;

      const { line } = lineCounter.linePos(stepNode.range[0]);
      steps.push({ line, persistsCredentialsFalse: persistsCredentialsFalse(doc, stepNode) });
    }
  }

  return steps;
}

/** Scans the given file paths and returns one violation per checkout step missing
 * `persist-credentials: false`. A workflow that fails to parse as YAML is reported as one
 * violation naming its first parse error, instead of being scanned (and silently passing). */
export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) => {
    const source = readFile(path);
    const doc = parseDocument(source);
    if (doc.errors.length > 0) {
      const [error] = doc.errors;
      return [
        { path, line: error.linePos[0].line, message: `does not parse as YAML: ${error.message}` },
      ];
    }

    return findCheckoutSteps(source)
      .filter((step) => !step.persistsCredentialsFalse)
      .map((step) => ({ path, line: step.line, message: MISSING_PERSIST_CREDENTIALS }));
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
