import { globSync, readFileSync } from "node:fs";
import { isMap, isSeq, LineCounter, parseDocument } from "yaml";

const CHECKOUT_ACTION = /^actions\/checkout@/i;

// A value set under a step's env: never reaches the action's inputs, so only with: counts.
function persistsCredentialsFalse(stepNode) {
  const withNode = stepNode.get("with", true);
  if (!isMap(withNode)) return false;
  const value = withNode.get("persist-credentials");
  return value === false || value === "false";
}

/** Every `actions/checkout` step across every job in a workflow's YAML source, with its start
 * line (1-indexed) and whether it sets `persist-credentials: false` under `with:`. */
export function findCheckoutSteps(source) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter });
  const jobsNode = doc.get("jobs", true);
  if (!isMap(jobsNode)) return [];

  const steps = [];
  for (const { value: jobNode } of jobsNode.items) {
    if (!isMap(jobNode)) continue;
    const stepsNode = jobNode.get("steps", true);
    if (!isSeq(stepsNode)) continue;

    for (const stepNode of stepsNode.items) {
      if (!isMap(stepNode)) continue;
      const uses = stepNode.get("uses");
      if (typeof uses !== "string" || !CHECKOUT_ACTION.test(uses)) continue;

      const { line } = lineCounter.linePos(stepNode.range[0]);
      steps.push({ line, persistsCredentialsFalse: persistsCredentialsFalse(stepNode) });
    }
  }

  return steps;
}

/** Scans the given file paths and returns one violation per checkout step missing
 * `persist-credentials: false`. */
export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findCheckoutSteps(readFile(path))
      .filter((step) => !step.persistsCredentialsFalse)
      .map((step) => ({ path, line: step.line })),
  );
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line }) {
  return `${path}:${line}: actions/checkout step has no persist-credentials: false`;
}
