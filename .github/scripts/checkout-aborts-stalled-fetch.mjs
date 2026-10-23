import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const CHECKOUT_ACTION = /^actions\/checkout@/i;
const LOW_SPEED_KEYS = ["GIT_HTTP_LOW_SPEED_LIMIT", "GIT_HTTP_LOW_SPEED_TIME"];
const POSITIVE_WHOLE_NUMBER = /^[1-9][0-9]*$/;
const MISSING_LOW_SPEED_ABORT =
  "actions/checkout step does not set GIT_HTTP_LOW_SPEED_LIMIT and GIT_HTTP_LOW_SPEED_TIME to positive whole numbers in its env";

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : resolved;
}

function envOf(doc, ownerNode) {
  const envNode = resolveNode(doc, ownerNode.get("env", true));
  if (!isMap(envNode)) return new Map();
  return new Map(
    envNode.items.map((pair) => [
      String(resolveScalar(doc, pair.key)),
      resolveScalar(doc, pair.value),
    ]),
  );
}

// GitHub merges workflow, job and step env with the most specific winning, and the git that
// actions/checkout runs receives all of it. git reads both variables by their exact name, and a
// zero in either turns the abort off.
function abortsStalledFetch(doc, workflowNode, jobNode, stepNode) {
  const env = new Map([
    ...envOf(doc, workflowNode),
    ...envOf(doc, jobNode),
    ...envOf(doc, stepNode),
  ]);
  return LOW_SPEED_KEYS.every((key) => POSITIVE_WHOLE_NUMBER.test(String(env.get(key))));
}

export function findCheckoutSteps(source) {
  return checkoutStepsOf(parseWorkflow(source));
}

function parseWorkflow(source) {
  const lineCounter = new LineCounter();
  return { doc: parseDocument(source, { lineCounter }), lineCounter };
}

function checkoutStepsOf({ doc, lineCounter }) {
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
      steps.push({
        line,
        abortsStalledFetch: abortsStalledFetch(doc, doc.contents, jobNode, stepNode),
      });
    }
  }

  return steps;
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

    return checkoutStepsOf(workflow)
      .filter((step) => !step.abortsStalledFetch)
      .map((step) => ({ path, line: step.line, message: MISSING_LOW_SPEED_ABORT }));
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
