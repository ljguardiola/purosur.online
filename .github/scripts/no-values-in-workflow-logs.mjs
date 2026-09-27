import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const EMBEDS_MESSAGE =
  "run: step embeds a ${{ }} expression that reads vars.*/secrets.*; pass it through the step's env: instead";
const TRACES_MESSAGE =
  "run: step traces the commands it runs (set -x, a traced shell, or Set-PSDebug -Trace)";

const EXPRESSION_RE = /\$\{\{([\s\S]*?)\}\}/g;
const STRING_LITERAL_RE = /'(?:[^']|'')*'/g;
const VARS_OR_SECRETS_RE = /(?<![\w.'"-])(vars|secrets)(?![\w-])/;
const ENV_MEMBER_RE = /(?<![\w.'"-])env(?:\.([A-Za-z_][\w-]*)|\[\s*['"]([^'"]+)['"]\s*\])/g;
const XTRACE_FLAG_RE = /^-[a-z]*x[a-z]*$/;
const PSDEBUG_TRACE_RE = /-trace\s+[12]\b/i;
const SHELL_WORDS = new Set(["bash", "sh"]);

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : resolved;
}

function expressionsOf(text) {
  return typeof text === "string" ? [...text.matchAll(EXPRESSION_RE)].map((match) => match[1]) : [];
}

function readsVarsOrSecrets(expression) {
  return VARS_OR_SECRETS_RE.test(expression.replace(STRING_LITERAL_RE, "''"));
}

// Stripping string literals would also erase a bracketed key such as env['NAME'], so the
// bare vars/secrets word check and the env member lookup read the expression differently.
function expressionReadsValue(expression, taintedEnvNames) {
  return (
    readsVarsOrSecrets(expression) ||
    [...expression.matchAll(ENV_MEMBER_RE)].some((match) =>
      taintedEnvNames.includes(match[1] ?? match[2]),
    )
  );
}

function envMapOf(doc, envNode) {
  const resolved = resolveNode(doc, envNode);
  if (!isMap(resolved)) return {};
  return Object.fromEntries(
    resolved.items
      .map(({ key, value }) => [resolveScalar(doc, key), resolveScalar(doc, value)])
      .filter(([name]) => typeof name === "string"),
  );
}

function taintedEnvNamesOf(envScopes) {
  const merged = Object.assign({}, ...envScopes);
  return Object.keys(merged).filter((name) => expressionsOf(merged[name]).some(readsVarsOrSecrets));
}

function flagsAfter(words) {
  const flags = [];
  for (let index = 0; index < words.length && words[index].startsWith("-"); index++) {
    flags.push(words[index]);
    if (words[index] === "-o") flags.push(words[++index]);
  }
  return flags;
}

function hasXtraceFlag(flags) {
  return flags.some(
    (flag, index) => XTRACE_FLAG_RE.test(flag) || (flag === "-o" && flags[index + 1] === "xtrace"),
  );
}

function shellCommandTraces(command, rest) {
  return SHELL_WORDS.has(command) && hasXtraceFlag(flagsAfter(rest));
}

function shellTraces(shellValue) {
  if (typeof shellValue !== "string") return false;
  const [command, ...rest] = shellValue.trim().split(/\s+/);
  return shellCommandTraces(command, rest);
}

function lineTraces(line) {
  const [command, ...rest] = line.trim().split(/\s+/);
  if (command === "set") return hasXtraceFlag(rest);
  if (shellCommandTraces(command, rest)) return true;
  return command?.toLowerCase() === "set-psdebug" && PSDEBUG_TRACE_RE.test(line);
}

function shellOf(doc, defaultsNode) {
  const defaults = resolveNode(doc, defaultsNode);
  if (!isMap(defaults)) return undefined;
  const run = resolveNode(doc, defaults.get("run", true));
  const shell = isMap(run) ? resolveScalar(doc, run.get("shell", true)) : undefined;
  return typeof shell === "string" ? shell : undefined;
}

function messagesForStep(doc, stepNode, envScopesAbove, shellsAbove) {
  const script = resolveScalar(doc, stepNode.get("run", true));
  if (typeof script !== "string") return [];

  const stepEnv = envMapOf(doc, stepNode.get("env", true));
  const taintedEnvNames = taintedEnvNamesOf([...envScopesAbove, stepEnv]);

  const stepShell = resolveScalar(doc, stepNode.get("shell", true));
  const effectiveShell =
    typeof stepShell === "string" ? stepShell : shellsAbove.find((shell) => shell !== undefined);

  const messages = [];
  if (
    expressionsOf(script).some((expression) => expressionReadsValue(expression, taintedEnvNames))
  ) {
    messages.push(EMBEDS_MESSAGE);
  }
  if (script.split(/\r\n|\r|\n/).some(lineTraces) || shellTraces(effectiveShell)) {
    messages.push(TRACES_MESSAGE);
  }
  return messages;
}

function parseWorkflow(source) {
  const lineCounter = new LineCounter();
  return { doc: parseDocument(source, { lineCounter }), lineCounter };
}

export function findRunStepViolations(source) {
  return runStepViolationsOf(parseWorkflow(source));
}

function runStepViolationsOf({ doc, lineCounter }) {
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  if (!isMap(jobsNode)) return [];

  const workflowEnv = envMapOf(doc, doc.get("env", true));
  const workflowShell = shellOf(doc, doc.get("defaults", true));
  const violations = [];

  for (const jobPair of jobsNode.items) {
    const jobNode = resolveNode(doc, jobPair.value);
    if (!isMap(jobNode)) continue;

    const jobEnv = envMapOf(doc, jobNode.get("env", true));
    const jobShell = shellOf(doc, jobNode.get("defaults", true));
    const stepsNode = resolveNode(doc, jobNode.get("steps", true));
    if (!isSeq(stepsNode)) continue;

    for (const stepItem of stepsNode.items) {
      const stepNode = resolveNode(doc, stepItem);
      if (!isMap(stepNode)) continue;

      const messages = messagesForStep(
        doc,
        stepNode,
        [workflowEnv, jobEnv],
        [jobShell, workflowShell],
      );
      if (messages.length === 0) continue;

      const { line } = lineCounter.linePos(stepNode.range[0]);
      for (const message of messages) violations.push({ line, message });
    }
  }
  return violations;
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
    return runStepViolationsOf(workflow).map(({ line, message }) => ({ path, line, message }));
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
