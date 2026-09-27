import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const INLINE_EXPRESSION_MESSAGE = `run: step embeds a \${{ vars.* }} or \${{ secrets.* }} expression; GitHub substitutes its value before printing the script to the log`;
const PRINTS_TAINTED_ENV_MESSAGE =
  "run: step prints an environment variable whose value comes from vars.* or secrets.*";
const DUMPS_ENVIRONMENT_MESSAGE =
  "run: step dumps the whole environment (env, printenv, set, export -p, or declare -p/-x), which would print any vars.*/secrets.* value held in an environment variable";
const TRACES_COMMANDS_MESSAGE =
  "run: step traces the commands it runs (set -x, a shell invoked with -x, or an xtrace shell), which prints each command's arguments, including any vars.*/secrets.* value already substituted into them";

const EXPRESSION_RE = /\$\{\{([^}]*)\}\}/g;
const VARS_OR_SECRETS_RE = /\b(vars|secrets)\.[A-Za-z0-9_]+/;
const ALLOWED_STDOUT_TARGETS = new Set(["/dev/stdout", "/dev/stderr", "&1", "&2"]);
const PRINT_COMMANDS = new Set(["echo", "printf"]);
const XTRACE_FLAG_RE = /^-[a-z]*x[a-z]*$/i;
const SHELL_COMMAND_RE = /(^|\/)(bash|sh)$/;

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : resolved;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expressionReferencesVarsOrSecrets(text) {
  if (typeof text !== "string") return false;
  for (const match of text.matchAll(EXPRESSION_RE)) {
    if (VARS_OR_SECRETS_RE.test(match[1])) return true;
  }
  return false;
}

function envMapOf(doc, envNode) {
  const resolved = resolveNode(doc, envNode);
  if (!isMap(resolved)) return {};

  const map = {};
  for (const pair of resolved.items) {
    const key = resolveScalar(doc, pair.key);
    if (typeof key !== "string") continue;
    map[key] = resolveScalar(doc, pair.value);
  }
  return map;
}

function shellOf(doc, defaultsNode) {
  const defaults = resolveNode(doc, defaultsNode);
  if (!isMap(defaults)) return undefined;
  const run = resolveNode(doc, defaults.get("run", true));
  if (!isMap(run)) return undefined;
  const shell = resolveScalar(doc, run.get("shell", true));
  return typeof shell === "string" ? shell : undefined;
}

function joinLineContinuations(script) {
  const rawLines = script.split(/\r\n|\r|\n/);
  const lines = [];
  for (const rawLine of rawLines) {
    const previous = lines[lines.length - 1];
    if (previous !== undefined && /\\$/.test(previous)) {
      lines[lines.length - 1] = `${previous.slice(0, -1)} ${rawLine}`;
    } else {
      lines.push(rawLine);
    }
  }
  return lines;
}

function splitCommandGroups(line) {
  const groups = [];
  let currentGroup = [];
  let stage = "";
  let quote = null;

  const pushStage = () => {
    currentGroup.push(stage);
    stage = "";
  };
  const pushGroup = () => {
    pushStage();
    groups.push(currentGroup);
    currentGroup = [];
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      stage += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      stage += ch;
      continue;
    }
    if (ch === "#") break;
    if (ch === "&" && line[i + 1] === "&") {
      pushGroup();
      i++;
      continue;
    }
    if (ch === "|" && line[i + 1] === "|") {
      pushGroup();
      i++;
      continue;
    }
    if (ch === "|") {
      pushStage();
      continue;
    }
    if (ch === ";") {
      pushGroup();
      continue;
    }
    stage += ch;
  }
  pushGroup();

  return groups.filter((stages) => stages.some((s) => s.trim() !== ""));
}

const REDIRECT_RE = /(&>{1,2}|[0-9]?>{1,2})\s*(\S+)/g;

function stdoutRedirectedAway(stageText) {
  let found = false;
  let lastTarget = null;
  for (const [, prefix, target] of stageText.matchAll(REDIRECT_RE)) {
    if (prefix.startsWith("&")) {
      found = true;
      lastTarget = target;
      continue;
    }
    const fd = prefix.slice(0, prefix.length - (prefix.endsWith(">>") ? 2 : 1)) || "1";
    if (fd === "2") continue;
    found = true;
    lastTarget = target;
  }
  if (!found) return false;
  return !ALLOWED_STDOUT_TARGETS.has(lastTarget);
}

function firstWord(stageText) {
  const match = stageText.trim().match(/^\S+/);
  return match ? match[0].replace(/^["']|["']$/g, "") : "";
}

function argsOf(stageText) {
  return stageText
    .trim()
    .replace(/^\S+\s*/, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/^["']|["']$/g, ""));
}

function stagePrintsName(stageText, name) {
  const command = firstWord(stageText);
  if (command === "printenv") return argsOf(stageText).includes(name);
  if (!PRINT_COMMANDS.has(command)) return false;

  const rest = stageText.trim().replace(/^\S+\s*/, "");
  if (/::add-mask::/.test(rest)) return false;

  return new RegExp(`\\$\\{?${escapeRegExp(name)}\\b`).test(rest);
}

function stageDumpsEnvironment(stageText) {
  const command = firstWord(stageText);
  const args = argsOf(stageText);

  if ((command === "env" || command === "printenv" || command === "set") && args.length === 0) {
    return true;
  }
  if (command === "export" && args.length === 1 && args[0] === "-p") return true;
  if (command === "declare" && args.length === 1 && (args[0] === "-p" || args[0] === "-x")) {
    return true;
  }
  return false;
}

function stageTracesCommands(stageText) {
  const command = firstWord(stageText);
  const args = argsOf(stageText);

  if (command === "set") {
    if (args[0] && XTRACE_FLAG_RE.test(args[0])) return true;
    return args[0] === "-o" && args[1] === "xtrace";
  }
  if (SHELL_COMMAND_RE.test(command)) {
    return args.some((arg) => XTRACE_FLAG_RE.test(arg));
  }
  return false;
}

function shellTraces(shellValue) {
  if (typeof shellValue !== "string") return false;
  const words = shellValue.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const [command, ...args] = words;
  if (!SHELL_COMMAND_RE.test(command.replace(/^["']|["']$/g, ""))) return false;
  return args.some((arg) => XTRACE_FLAG_RE.test(arg));
}

function messagesForStep(doc, stepNode, workflowEnv, jobEnv, inheritedShell) {
  const script = resolveScalar(doc, stepNode.get("run", true));
  if (typeof script !== "string") return [];

  const stepEnv = envMapOf(doc, stepNode.get("env", true));
  const effectiveEnv = { ...workflowEnv, ...jobEnv, ...stepEnv };
  const taintedNames = Object.keys(effectiveEnv).filter((name) =>
    expressionReferencesVarsOrSecrets(effectiveEnv[name]),
  );

  const stepShell = resolveScalar(doc, stepNode.get("shell", true));
  const effectiveShell = typeof stepShell === "string" ? stepShell : inheritedShell;

  const messages = [];
  if (expressionReferencesVarsOrSecrets(script)) messages.push(INLINE_EXPRESSION_MESSAGE);

  let printsTainted = false;
  let dumpsEnvironment = false;
  let traces = shellTraces(effectiveShell);

  for (const line of joinLineContinuations(script)) {
    for (const stages of splitCommandGroups(line)) {
      const stage = stages[stages.length - 1];
      const trimmed = stage.trim();
      if (trimmed === "") continue;

      if (!traces && stageTracesCommands(trimmed)) traces = true;
      if (stdoutRedirectedAway(stage)) continue;

      if (!printsTainted && taintedNames.some((name) => stagePrintsName(trimmed, name))) {
        printsTainted = true;
      }
      if (!dumpsEnvironment && stageDumpsEnvironment(trimmed)) dumpsEnvironment = true;
    }
  }

  if (printsTainted) messages.push(PRINTS_TAINTED_ENV_MESSAGE);
  if (dumpsEnvironment) messages.push(DUMPS_ENVIRONMENT_MESSAGE);
  if (traces) messages.push(TRACES_COMMANDS_MESSAGE);

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
    const jobShell = shellOf(doc, jobNode.get("defaults", true)) ?? workflowShell;

    const stepsNode = resolveNode(doc, jobNode.get("steps", true));
    if (!isSeq(stepsNode)) continue;

    for (const stepItem of stepsNode.items) {
      const stepNode = resolveNode(doc, stepItem);
      if (!isMap(stepNode)) continue;

      const messages = messagesForStep(doc, stepNode, workflowEnv, jobEnv, jobShell);
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
