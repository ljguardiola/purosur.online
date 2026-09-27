import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const INLINE_EXPRESSION_MESSAGE = `run: step embeds a \${{ }} expression that reads vars.*, secrets.*, or an env value fed from them; GitHub substitutes its value before printing the script to the log`;
const PRINTS_TAINTED_ENV_MESSAGE =
  "run: step prints an environment variable whose value comes from vars.* or secrets.*";
const DUMPS_ENVIRONMENT_MESSAGE =
  "run: step dumps the whole environment (env, printenv, set, export, declare, or Get-ChildItem env:), which would print any vars.*/secrets.* value held in an environment variable";
const TRACES_COMMANDS_MESSAGE =
  "run: step traces the commands it runs (set -x, a shell invoked with -x, an xtrace shell, or Set-PSDebug -Trace), which prints each command's arguments, including any vars.*/secrets.* value already substituted into them";

const EXPRESSION_RE = /\$\{\{([\s\S]*?)\}\}/g;
const STRING_LITERAL_RE = /(\[\s*)?'(?:[^']|'')*'/g;
const VARS_OR_SECRETS_RE = /(?<![\w.'"-])(vars|secrets)(?![\w-])/;
const ENV_REFERENCE_RE = /(?<![\w.'"-])env(?:\.([A-Za-z_][\w-]*)|\[\s*['"]([^'"]+)['"]\s*\])/g;
const WHOLE_ENV_RE = /(?<![\w.'"-])env(?![\w-])(?!\s*(?:\.\s*[A-Za-z_]|\[\s*['"]))/;
const ALLOWED_STDOUT_TARGETS = new Set(["/dev/stdout", "/dev/stderr", "&1", "&2"]);
const PRINT_COMMANDS = new Set(["echo", "printf"]);
const SHELL_COMMANDS = new Set(["bash", "sh"]);
const STDOUT_REDIRECT_FDS = new Set(["1", "&", "*"]);

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

function withoutStringLiterals(expression) {
  return expression.replace(STRING_LITERAL_RE, (literal, indexOpening) =>
    indexOpening ? literal : "''",
  );
}

function expressionsOf(text) {
  if (typeof text !== "string") return [];
  return [...text.matchAll(EXPRESSION_RE)].map((match) => withoutStringLiterals(match[1]));
}

function expressionReadsTaintedValue(expression, taintedNames) {
  return (
    VARS_OR_SECRETS_RE.test(expression) ||
    [...expression.matchAll(ENV_REFERENCE_RE)].some((match) =>
      taintedNames.includes(match[1] ?? match[2]),
    ) ||
    (taintedNames.length > 0 && WHOLE_ENV_RE.test(expression))
  );
}

function readsTaintedValue(text, taintedNames) {
  return expressionsOf(text).some((expression) =>
    expressionReadsTaintedValue(expression, taintedNames),
  );
}

function taintedNamesOf(envScopes) {
  return envScopes.reduce(
    (inherited, env) => [
      ...inherited.filter((name) => !Object.hasOwn(env, name)),
      ...Object.keys(env).filter((name) => readsTaintedValue(env[name], inherited)),
    ],
    [],
  );
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

function runnerDefaultShell(doc, jobNode) {
  return runnerLabelsOf(doc, jobNode.get("runs-on", true)).some((label) => /windows/i.test(label))
    ? "pwsh"
    : "bash";
}

function runnerLabelsOf(doc, node) {
  const resolved = resolveNode(doc, node);
  if (isScalar(resolved)) return [String(resolved.value)];
  if (isSeq(resolved)) return resolved.items.map((item) => String(resolveScalar(doc, item)));
  if (isMap(resolved)) return runnerLabelsOf(doc, resolved.get("labels", true));
  return [];
}

function isPowerShell(shellValue) {
  const [command = ""] = shellValue.trim().split(/\s+/);
  const name = command
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/\.exe$/, "");
  return name === "pwsh" || name === "powershell";
}

function joinLineContinuations(script, continuation) {
  const rawLines = script.split(/\r\n|\r|\n/);
  const lines = [];
  for (const rawLine of rawLines) {
    const previous = lines[lines.length - 1];
    if (previous?.endsWith(continuation)) {
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
    if (ch === "#" && (i === 0 || /[\s;|&(]/.test(line[i - 1]))) break;
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

function parseStage(text, escapeCharacter) {
  const words = [];
  const redirects = [];
  const hereStrings = [];
  let i = 0;

  const skipSpaces = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const readWord = () => {
    const start = i;
    let unquoted = "";
    let quote = null;
    let substitutionDepth = 0;
    while (i < text.length) {
      const ch = text[i];
      if (quote) {
        if (ch === quote) quote = null;
        else unquoted += ch;
        i++;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
        i++;
      } else if (ch === escapeCharacter && i + 1 < text.length) {
        unquoted += text[i + 1];
        i += 2;
      } else if (ch === "$" && text[i + 1] === "(") {
        substitutionDepth++;
        unquoted += "$(";
        i += 2;
      } else if (substitutionDepth > 0) {
        if (ch === ")") substitutionDepth--;
        unquoted += ch;
        i++;
      } else if (/[\s<>()]/.test(ch)) {
        break;
      } else {
        unquoted += ch;
        i++;
      }
    }
    return { raw: text.slice(start, i), text: unquoted, end: i };
  };

  while (i < text.length) {
    const ch = text[i];
    if (/[\s()]/.test(ch)) {
      i++;
    } else if (ch === ">" || (ch === "&" && text[i + 1] === ">")) {
      let fd = "1";
      if (ch === "&") {
        fd = "&";
        i++;
      } else {
        const previous = words[words.length - 1];
        if (previous && previous.end === i && /^[0-9*]$/.test(previous.raw)) {
          words.pop();
          fd = previous.raw;
        }
      }
      i++;
      if (text[i] === ">") i++;
      const duplicates = text[i] === "&";
      if (duplicates) i++;
      skipSpaces();
      redirects.push({ fd, target: `${duplicates ? "&" : ""}${readWord().text}` });
    } else if (text.startsWith("<<<", i)) {
      i += 3;
      skipSpaces();
      hereStrings.push(readWord().raw);
    } else if (ch === "<") {
      while (text[i] === "<") i++;
      skipSpaces();
      readWord();
    } else {
      const word = readWord();
      if (word.raw === "") i++;
      else words.push({ ...word, followedBy: text.slice(word.end).trimStart() });
    }
  }

  return { command: commandOf(words), redirects, hereStrings };
}

const COMMAND_PREFIXES = new Set([
  "if",
  "then",
  "elif",
  "else",
  "while",
  "until",
  "do",
  "!",
  "{",
  "time",
  "command",
  "builtin",
]);
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

function prefixLengthAt(words, index) {
  const word = words[index];
  if (COMMAND_PREFIXES.has(word.raw) || ASSIGNMENT_RE.test(word.raw)) return 1;
  if (word.raw === "case" && words[index + 2]?.raw === "in") return 3;
  if (word.raw === "function") return 2;
  if (/^\(\s*\)/.test(word.followedBy)) return 1;
  const isCasePattern = word.followedBy.startsWith(")") && index < words.length - 1;
  return isCasePattern ? 1 : 0;
}

function commandOf(words) {
  let index = 0;
  while (index < words.length) {
    const prefixLength = prefixLengthAt(words, index);
    if (prefixLength === 0) break;
    index += prefixLength;
  }
  if (index >= words.length) return null;
  const [first, ...args] = words.slice(index);
  return { name: first.text.split("/").pop(), raw: first.raw, args };
}

const PASS_THROUGH_FILTERS = new Set([
  "cat",
  "sort",
  "uniq",
  "grep",
  "head",
  "tail",
  "tee",
  "base64",
  "sed",
  "awk",
  "cut",
  "tr",
  "jq",
  "xxd",
  "od",
  "rev",
  "fold",
]);

const GREP_OPTIONS_PRINTING_NO_INPUT_LINES = new Set([
  "--quiet",
  "--silent",
  "--count",
  "--files-with-matches",
  "--files-without-match",
]);

function printsNoInputLines(command) {
  return (
    command.name === "grep" &&
    command.args.some(
      ({ text }) =>
        GREP_OPTIONS_PRINTING_NO_INPUT_LINES.has(text) || /^-[^-]*[qclL]/.test(text),
    )
  );
}

function passesInputThrough(command) {
  return PASS_THROUGH_FILTERS.has(command.name) && !printsNoInputLines(command);
}

function reachesLog(stages, index) {
  return (
    stages.slice(index).every((stage) => !stdoutRedirectedAway(stage)) &&
    stages.slice(index + 1).every(({ command }) => command && passesInputThrough(command))
  );
}

function stdoutRedirectedAway(stage) {
  const stdoutRedirects = stage.redirects.filter(({ fd }) => STDOUT_REDIRECT_FDS.has(fd));
  if (stdoutRedirects.length === 0) return false;
  return !ALLOWED_STDOUT_TARGETS.has(stdoutRedirects[stdoutRedirects.length - 1].target);
}

function referencesName(text, name) {
  return new RegExp(`\\$\\{?${escapeRegExp(name)}\\b`).test(text);
}

function stagePrintsName({ command, hereStrings }, name) {
  if (!command) return false;
  if (command.name === "printenv") return command.args.some((arg) => arg.text === name);
  if (PASS_THROUGH_FILTERS.has(command.name)) {
    return (
      passesInputThrough(command) &&
      hereStrings.some((hereString) => referencesName(hereString, name))
    );
  }
  if (!PRINT_COMMANDS.has(command.name)) return false;

  const rest = command.args.map((arg) => arg.raw).join(" ");
  if (/::add-mask::/.test(rest)) return false;
  return referencesName(rest, name);
}

const DUMPS_WITH_ONLY_OPTIONS = new Set(["env", "printenv", "export", "declare", "typeset"]);

function stageDumpsEnvironment({ command }) {
  if (!command) return false;
  if (command.name === "set") return command.args.length === 0;
  if (!DUMPS_WITH_ONLY_OPTIONS.has(command.name)) return false;
  return command.args.every((arg) => arg.text.startsWith("-"));
}

function readShellOptions(args, { stopAtOperand }) {
  let xtrace = false;
  let readsCommandString = false;
  let index = 0;
  for (; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--" || arg === "-") {
      index++;
      break;
    }
    if (arg.startsWith("--")) continue;
    if (!/^[-+]./.test(arg)) {
      if (stopAtOperand) break;
      continue;
    }
    const enables = arg[0] === "-";
    const letters = arg.slice(1);
    if (enables && letters.includes("x")) xtrace = true;
    if (letters.includes("c")) readsCommandString = true;
    if (/[oO]/.test(letters)) {
      index++;
      if (enables && args[index] === "xtrace") xtrace = true;
    }
  }
  return { xtrace, readsCommandString, operands: args.slice(index) };
}

function stageTracesCommands({ command }) {
  if (!command) return false;
  const args = command.args.map((arg) => arg.text);
  if (command.name === "set") return readShellOptions(args, { stopAtOperand: false }).xtrace;
  if (SHELL_COMMANDS.has(command.name)) {
    return readShellOptions(args, { stopAtOperand: true }).xtrace;
  }
  return false;
}

function shellTraces(shellValue) {
  if (typeof shellValue !== "string") return false;
  const [command = "", ...args] = shellValue.trim().split(/\s+/);
  if (!SHELL_COMMANDS.has(command.split("/").pop())) return false;
  return readShellOptions(args, { stopAtOperand: true }).xtrace;
}

const NO_FINDINGS = { printsTainted: false, dumpsEnvironment: false, traces: false };

function commandStringFindings({ command }, taintedNames) {
  if (!command || !SHELL_COMMANDS.has(command.name)) return NO_FINDINGS;
  const args = command.args.map((arg) => arg.text);
  const { readsCommandString, operands } = readShellOptions(args, { stopAtOperand: true });
  if (!readsCommandString || operands.length === 0) return NO_FINDINGS;
  return scriptFindings(operands[0], taintedNames, BASH);
}

const BASH = {
  continuation: "\\",
  escape: "\\",
  reachesLog,
  printsName: stagePrintsName,
  dumpsEnvironment: stageDumpsEnvironment,
  tracesCommands: stageTracesCommands,
  commandStringFindings,
};

const PWSH_PRINT_COMMANDS = new Set([
  "echo",
  "write",
  "write-host",
  "write-output",
  "write-information",
]);
const PWSH_HOST_STREAM_COMMANDS = new Set(["write-host", "write-information"]);
const PWSH_PASS_THROUGH_COMMANDS = new Set([
  "sort-object",
  "sort",
  "select-object",
  "select",
  "where-object",
  "where",
  "format-table",
  "ft",
  "format-list",
  "fl",
  "out-string",
  "out-host",
  "tee-object",
  "tee",
]);
const PWSH_ENV_LISTING_COMMANDS = new Set(["get-childitem", "gci", "dir", "ls"]);
const PWSH_ASSIGNMENT_RE = /^\$[^\s"'=]*\s*[-+*/%?]?=(?!=)/;

function pwshNameOf(command) {
  return command.name.toLowerCase();
}

function pwshReachesLog(stages, index) {
  const { command, redirects } = stages[index];
  // Write-Host and Write-Information write to PowerShell's information stream (6), which neither
  // a pipe nor a > redirect of the output stream captures.
  if (command && PWSH_HOST_STREAM_COMMANDS.has(pwshNameOf(command))) {
    return !redirects.some(({ fd }) => fd === "*" || fd === "6");
  }
  return (
    stages.slice(index).every((stage) => !stdoutRedirectedAway(stage)) &&
    stages
      .slice(index + 1)
      .every(({ command }) => command && PWSH_PASS_THROUGH_COMMANDS.has(pwshNameOf(command)))
  );
}

function pwshStagePrintsName({ command }, name) {
  if (!command) return false;
  const text = [command.raw, ...command.args.map((arg) => arg.raw)].join(" ");
  if (!new RegExp(`\\$\\{?env:${escapeRegExp(name)}\\b`, "i").test(text)) return false;
  if (PWSH_PRINT_COMMANDS.has(pwshNameOf(command))) return !/::add-mask::/.test(text);
  return /^["$]/.test(command.raw) && !PWSH_ASSIGNMENT_RE.test(text);
}

function pwshStageDumpsEnvironment({ command }) {
  if (!command || !PWSH_ENV_LISTING_COMMANDS.has(pwshNameOf(command))) return false;
  return command.args.some((arg) => /^env:[\\/]?\*?$/i.test(arg.text));
}

function pwshStageTracesCommands({ command }) {
  if (!command || pwshNameOf(command) !== "set-psdebug") return false;
  return /-trace(:|\s+)[12]\b/i.test(command.args.map((arg) => arg.text).join(" "));
}

const POWERSHELL = {
  continuation: "`",
  escape: "`",
  reachesLog: pwshReachesLog,
  printsName: pwshStagePrintsName,
  dumpsEnvironment: pwshStageDumpsEnvironment,
  tracesCommands: pwshStageTracesCommands,
  commandStringFindings: () => NO_FINDINGS,
};

function scriptFindings(script, taintedNames, dialect) {
  const findings = { ...NO_FINDINGS };
  for (const line of joinLineContinuations(script, dialect.continuation)) {
    for (const stageTexts of splitCommandGroups(line)) {
      const stages = stageTexts.map((text) => parseStage(text, dialect.escape));
      stages.forEach((stage, index) => {
        const inner = dialect.commandStringFindings(stage, taintedNames);
        if (inner.traces || dialect.tracesCommands(stage)) findings.traces = true;
        if (!dialect.reachesLog(stages, index)) return;
        if (inner.printsTainted || taintedNames.some((name) => dialect.printsName(stage, name))) {
          findings.printsTainted = true;
        }
        if (inner.dumpsEnvironment || dialect.dumpsEnvironment(stage)) {
          findings.dumpsEnvironment = true;
        }
      });
    }
  }
  return findings;
}

function messagesForStep(doc, stepNode, workflowEnv, jobEnv, inheritedShell) {
  const script = resolveScalar(doc, stepNode.get("run", true));
  if (typeof script !== "string") return [];

  const stepEnv = envMapOf(doc, stepNode.get("env", true));
  const taintedNames = taintedNamesOf([workflowEnv, jobEnv, stepEnv]);

  const stepShell = resolveScalar(doc, stepNode.get("shell", true));
  const effectiveShell = typeof stepShell === "string" ? stepShell : inheritedShell;

  const messages = [];
  if (readsTaintedValue(script, taintedNames)) messages.push(INLINE_EXPRESSION_MESSAGE);

  const findings = scriptFindings(
    script,
    taintedNames,
    isPowerShell(effectiveShell) ? POWERSHELL : BASH,
  );
  if (findings.printsTainted) messages.push(PRINTS_TAINTED_ENV_MESSAGE);
  if (findings.dumpsEnvironment) messages.push(DUMPS_ENVIRONMENT_MESSAGE);
  if (findings.traces || shellTraces(effectiveShell)) messages.push(TRACES_COMMANDS_MESSAGE);

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
    const jobShell =
      shellOf(doc, jobNode.get("defaults", true)) ??
      workflowShell ??
      runnerDefaultShell(doc, jobNode);

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
