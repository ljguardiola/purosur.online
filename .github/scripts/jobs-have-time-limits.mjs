import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, LineCounter, parseDocument } from "yaml";

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function hasTimeLimit(doc, jobNode) {
  const timeout = resolveNode(doc, jobNode.get("timeout-minutes", true));
  return isScalar(timeout) && typeof timeout.value === "number" && timeout.value > 0;
}

function callsReusableWorkflow(jobNode) {
  return jobNode.has("uses");
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) => {
    const lineCounter = new LineCounter();
    const doc = parseDocument(readFile(path), { lineCounter });
    if (doc.errors.length > 0) {
      const [error] = doc.errors;
      return [
        { path, line: error.linePos[0].line, message: `does not parse as YAML: ${error.message}` },
      ];
    }

    const jobsNode = resolveNode(doc, doc.get("jobs", true));
    if (!isMap(jobsNode)) return [];

    return jobsNode.items
      .filter((jobPair) => {
        const jobNode = resolveNode(doc, jobPair.value);
        return isMap(jobNode) && !callsReusableWorkflow(jobNode) && !hasTimeLimit(doc, jobNode);
      })
      .map((jobPair) => ({
        path,
        line: lineCounter.linePos(jobPair.key.range[0]).line,
        message: `job ${jobPair.key.value} has no timeout-minutes`,
      }));
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
