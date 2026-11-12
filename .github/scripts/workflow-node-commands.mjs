import { posix } from "node:path";
import { isAlias, isMap, isScalar } from "yaml";

export const WORKSPACE = "\0workspace\0";
export const WORKSPACE_PREFIXES = [
  /^\$\{\{\s*github\.workspace\s*\}\}/,
  /^\$\{GITHUB_WORKSPACE\}/,
  /^\$GITHUB_WORKSPACE\b/,
];

const NODE_FLAGS_WITH_VALUE = new Set([
  "-r",
  "--require",
  "--import",
  "--loader",
  "--experimental-loader",
  "-C",
  "--conditions",
  "--env-file",
  "--env-file-if-exists",
  "--input-type",
  "--title",
  "--disable-warning",
  "--watch-path",
  "--redirect-warnings",
  "--experimental-config-file",
  "--inspect-port",
  "--test-reporter",
  "--test-reporter-destination",
  "--test-name-pattern",
  "--test-skip-pattern",
  "--test-shard",
  "--test-concurrency",
  "--test-timeout",
  "--test-isolation",
  "--test-coverage-include",
  "--test-coverage-exclude",
]);
const NODE_PRELOAD_FLAGS = new Set([
  "-r",
  "--require",
  "--import",
  "--loader",
  "--experimental-loader",
]);
const NODE_EVAL_FLAGS = new Set(["-e", "--eval", "-p", "--print"]);
const NODE_NO_SCRIPT_FLAGS = new Set(["-v", "--version", "-h", "--help", "--v8-options"]);

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : undefined;
}

function defaultWorkingDirectory(doc, node) {
  const resolved = resolveNode(doc, node);
  if (!isMap(resolved)) return undefined;
  const defaults = resolveNode(doc, resolved.get("defaults", true));
  if (!isMap(defaults)) return undefined;
  const run = resolveNode(doc, defaults.get("run", true));
  return isMap(run) ? resolveScalar(doc, run.get("working-directory", true)) : undefined;
}

export function insideRepository(directory, path) {
  const joined = posix.normalize(posix.join(directory, path));
  return joined === ".." || joined.startsWith("../") || posix.isAbsolute(path) ? undefined : joined;
}

// A working directory is a repository path, or undefined when it lies outside the repository or
// depends on a value only known while the job runs.
function resolveWorkingDirectory(value) {
  if (value === undefined || value === null) return ".";
  let path = String(value);
  for (const prefix of WORKSPACE_PREFIXES) path = path.replace(prefix, ".");
  return path.includes("$") ? undefined : insideRepository(".", path);
}

export function stepWorkingDirectory(doc, workflow, job, step) {
  return resolveWorkingDirectory(
    resolveScalar(doc, resolveNode(doc, step).get("working-directory", true)) ??
      defaultWorkingDirectory(doc, job) ??
      defaultWorkingDirectory(doc, workflow),
  );
}

export function flagValue(args, index, inlineValue) {
  return inlineValue === undefined
    ? { value: args[index + 1], next: index + 1 }
    : { value: { ...args[index], text: inlineValue }, next: index };
}

export function nodeEntries(args) {
  const entries = [];
  const positionals = [];
  let runsTests = false;
  let evaluates = false;

  let index = 0;
  for (; index < args.length; index += 1) {
    const word = args[index];
    if (word.text === "--") {
      index += 1;
      break;
    }
    if (!word.text.startsWith("-") || word.text === "-") break;
    const [flag, inlineValue] = word.text.split(/=(.*)/s);
    if (NODE_NO_SCRIPT_FLAGS.has(flag)) return [];
    if (flag === "--test") runsTests = true;
    if (NODE_EVAL_FLAGS.has(flag)) {
      const { value, next } = flagValue(args, index, inlineValue);
      index = next;
      if (value !== undefined)
        entries.push({ kind: "code", code: value.text, label: `node ${flag} code` });
      evaluates = true;
    } else if (NODE_FLAGS_WITH_VALUE.has(flag)) {
      const { value, next } = flagValue(args, index, inlineValue);
      index = next;
      if (value !== undefined && NODE_PRELOAD_FLAGS.has(flag)) {
        entries.push({ kind: "preload", word: value, label: `node ${flag} ${value.text}` });
      }
    }
  }
  positionals.push(...args.slice(index));

  if (evaluates) return entries;
  if (runsTests) {
    if (positionals.length === 0) entries.push({ kind: "default-tests" });
    for (const word of positionals) entries.push({ kind: "test-file", word });
  } else if (positionals.length > 0 && positionals[0].text !== "-") {
    entries.push({ kind: "script", word: positionals[0] });
  }
  return entries;
}

export function wordPath(word, workingDirectory) {
  if (word.unresolved || workingDirectory === undefined) return undefined;
  if (word.text.startsWith(WORKSPACE)) {
    return insideRepository(".", `.${word.text.slice(WORKSPACE.length)}`);
  }
  return insideRepository(workingDirectory, word.text);
}
