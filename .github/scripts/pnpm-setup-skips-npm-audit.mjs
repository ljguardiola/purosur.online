import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const PNPM_SETUP_ACTION = /^pnpm\/action-setup@/i;
const NPM_AUDIT_KEY = /^npm_config_audit$/i;
const MISSING_NPM_AUDIT_OFF =
  'pnpm/action-setup step does not set npm_config_audit: "false" in its env';

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

// GitHub merges workflow, job and step env with the most specific winning, and
// the action's npm process receives all of it. npm reads npm_config_* keys case-insensitively.
function skipsNpmAudit(doc, workflowNode, jobNode, stepNode) {
  const env = new Map([
    ...envOf(doc, workflowNode),
    ...envOf(doc, jobNode),
    ...envOf(doc, stepNode),
  ]);
  const values = [...env].filter(([key]) => NPM_AUDIT_KEY.test(key)).map(([, value]) => value);
  return values.length > 0 && values.every((value) => value === false || value === "false");
}

export function findPnpmSetupSteps(source) {
  return pnpmSetupStepsOf(parseWorkflow(source));
}

function parseWorkflow(source) {
  const lineCounter = new LineCounter();
  return { doc: parseDocument(source, { lineCounter }), lineCounter };
}

function pnpmSetupStepsOf({ doc, lineCounter }) {
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
      if (typeof uses !== "string" || !PNPM_SETUP_ACTION.test(uses)) continue;

      const { line } = lineCounter.linePos(stepNode.range[0]);
      steps.push({ line, skipsNpmAudit: skipsNpmAudit(doc, doc.contents, jobNode, stepNode) });
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

    return pnpmSetupStepsOf(workflow)
      .filter((step) => !step.skipsNpmAudit)
      .map((step) => ({ path, line: step.line, message: MISSING_NPM_AUDIT_OFF }));
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
