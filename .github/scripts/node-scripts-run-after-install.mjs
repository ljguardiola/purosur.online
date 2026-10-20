import { globSync, readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { posix } from "node:path";
import ts from "typescript";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const WORKSPACE = "\0workspace\0";
const GITHUB_SCRIPT_ACTION = /^actions\/github-script@/i;
const GITHUB_SCRIPT_WORKSPACE = "__github_workspace__";
const WORKSPACE_EXPRESSION = /\$\{\{\s*github\.workspace\s*\}\}/g;
const WORKSPACE_PREFIXES = [
  /^\$\{\{\s*github\.workspace\s*\}\}/,
  /^\$\{GITHUB_WORKSPACE\}/,
  /^\$GITHUB_WORKSPACE\b/,
];

const SHELL_PREFIX_WORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
  "!",
  "time",
  "exec",
  "{",
  "}",
]);

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
const PNPM_DIRECTORY_FLAGS = new Set(["-C", "--dir"]);
const PNPM_FLAGS_WITH_VALUE = new Set([
  "-F",
  "--filter",
  "--filter-prod",
  "--reporter",
  "--loglevel",
  "--test-pattern",
  "--changed-files-ignore-pattern",
]);

const TEST_RUNNER_EXTENSIONS = "{cjs,mjs,js,cts,mts,ts}";
const TEST_RUNNER_DEFAULT_PATTERNS = [
  `**/*.test.${TEST_RUNNER_EXTENSIONS}`,
  `**/*-test.${TEST_RUNNER_EXTENSIONS}`,
  `**/*_test.${TEST_RUNNER_EXTENSIONS}`,
  `**/test-*.${TEST_RUNNER_EXTENSIONS}`,
  `**/test.${TEST_RUNNER_EXTENSIONS}`,
  `**/test/**/*.${TEST_RUNNER_EXTENSIONS}`,
];
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);
const GLOB_CHARACTERS = /[*?[]/;
const PACKAGE_SPECIFIER =
  /^(?:@[A-Za-z0-9~-][A-Za-z0-9._~-]*\/)?[A-Za-z0-9~-][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9._~@-]+)*$/;

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : undefined;
}

function defaultWorkingDirectory(doc, node) {
  const defaults = resolveNode(doc, node?.get("defaults", true));
  if (!isMap(defaults)) return undefined;
  const run = resolveNode(doc, defaults.get("run", true));
  return isMap(run) ? resolveScalar(doc, run.get("working-directory", true)) : undefined;
}

// A working directory is a repository path, or undefined when it lies outside the repository or
// depends on a value only known while the job runs.
function resolveWorkingDirectory(value) {
  if (value === undefined || value === null) return ".";
  let path = String(value);
  for (const prefix of WORKSPACE_PREFIXES) path = path.replace(prefix, ".");
  return path.includes("$") ? undefined : insideRepository(".", path);
}

function insideRepository(directory, path) {
  const joined = posix.normalize(posix.join(directory, path));
  return joined === ".." || joined.startsWith("../") || posix.isAbsolute(path) ? undefined : joined;
}

function findClosing(script, start, open, close) {
  let depth = 1;
  for (let index = start; index < script.length; index += 1) {
    const character = script[index];
    if (character === "\\") index += 1;
    else if (character === "'") {
      const end = script.indexOf("'", index + 1);
      if (end === -1) return script.length;
      index = end;
    } else if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return script.length;
}

// Splits a shell script into its commands, in the order they run: a command substitution runs
// before the command whose word it is part of.
function shellCommands(script) {
  const commands = [];
  let words = [];
  let word = null;
  let skipNextWord = false;
  let hereDocumentOperator = null;
  const hereDocuments = [];
  let arithmeticDepth = 0;

  const startWord = () => {
    word ??= { text: "", unresolved: false };
  };
  const endWord = () => {
    if (word === null) return;
    if (skipNextWord) {
      skipNextWord = false;
      if (hereDocumentOperator !== null) {
        hereDocuments.push({ delimiter: word.text, stripsTabs: hereDocumentOperator === "<<-" });
        hereDocumentOperator = null;
      }
    } else words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    skipNextWord = false;
    hereDocumentOperator = null;
    if (words.length > 0) commands.push(words);
    words = [];
  };
  const skipHereDocuments = (start) => {
    let lineStart = start;
    for (const { delimiter, stripsTabs } of hereDocuments) {
      while (lineStart < script.length) {
        const end = script.indexOf("\n", lineStart);
        const lineEnd = end === -1 ? script.length : end;
        const line = script.slice(lineStart, lineEnd);
        lineStart = lineEnd + 1;
        if ((stripsTabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
      }
    }
    hereDocuments.length = 0;
    return lineStart;
  };
  const substitute = (inner) => {
    const outerWords = words;
    commands.push(...shellCommands(inner));
    words = outerWords;
    startWord();
    word.text += "$(…)";
    word.unresolved = true;
  };
  const expand = (index) => {
    const rest = script.slice(index);
    if (word === null || word.text === "") {
      for (const prefix of WORKSPACE_PREFIXES) {
        const match = rest.match(prefix);
        if (match) {
          startWord();
          word.text += WORKSPACE;
          return index + match[0].length;
        }
      }
    }
    startWord();
    word.unresolved = true;
    const expression = rest.match(
      /^\$\{\{.*?\}\}|^\$\{[^}]*\}|^\$[A-Za-z_][A-Za-z0-9_]*|^\$[0-9@*#?$!-]/,
    );
    const text = expression ? expression[0] : "$";
    word.text += text;
    return index + text.length;
  };

  let index = 0;
  while (index < script.length) {
    const character = script[index];
    const next = script[index + 1];

    if (character === "\\" && next === "\n") {
      index += 2;
    } else if (character === "\\") {
      startWord();
      word.text += next ?? "";
      index += 2;
    } else if (character === "#" && word === null) {
      const end = script.indexOf("\n", index);
      index = end === -1 ? script.length : end;
    } else if (character === "'") {
      startWord();
      const end = script.indexOf("'", index + 1);
      const close = end === -1 ? script.length : end;
      word.text += script.slice(index + 1, close);
      index = close + 1;
    } else if (character === '"') {
      startWord();
      index += 1;
      while (index < script.length && script[index] !== '"') {
        if (script[index] === "\\" && index + 1 < script.length) {
          word.text += script[index + 1];
          index += 2;
        } else if (script[index] === "$" && script[index + 1] === "(") {
          const close = findClosing(script, index + 2, "(", ")");
          substitute(script.slice(index + 2, close));
          index = close + 1;
        } else if (script[index] === "$") {
          index = expand(index);
        } else {
          word.text += script[index];
          index += 1;
        }
      }
      index += 1;
    } else if (character === "$" && next === "(") {
      const close = findClosing(script, index + 2, "(", ")");
      substitute(script.slice(index + 2, close));
      index = close + 1;
    } else if (character === "`") {
      const end = script.indexOf("`", index + 1);
      const close = end === -1 ? script.length : end;
      substitute(script.slice(index + 1, close));
      index = close + 1;
    } else if (character === "$") {
      index = expand(index);
    } else if ((character === "<" || character === ">") && next === "(") {
      const close = findClosing(script, index + 2, "(", ")");
      substitute(script.slice(index + 2, close));
      index = close + 1;
    } else if (character === ">" || character === "<" || (character === "&" && next === ">")) {
      if (word !== null && /^\d+$/.test(word.text) && !word.unresolved) word = null;
      endWord();
      const operator = script.slice(index).match(/^(?:&>>?|[<>]{1,3}&?(?:\d+-?|-)?)/)[0];
      skipNextWord = !/&(?:\d+-?|-)$/.test(operator);
      hereDocumentOperator = arithmeticDepth === 0 && /^<<-?$/.test(operator) ? operator : null;
      index += operator.length;
    } else if (
      character === "(" &&
      next === "(" &&
      word === null &&
      script[findClosing(script, index + 2, "(", ")") + 1] === ")"
    ) {
      endCommand();
      arithmeticDepth = 2;
      index += 2;
    } else if (character === "\n") {
      endCommand();
      index = skipHereDocuments(index + 1);
    } else if (
      character === ";" ||
      character === "|" ||
      character === "&" ||
      character === "(" ||
      character === ")"
    ) {
      endCommand();
      if (arithmeticDepth > 0 && character === "(") arithmeticDepth += 1;
      if (arithmeticDepth > 0 && character === ")") arithmeticDepth -= 1;
      index += 1;
    } else if (character === " " || character === "\t" || character === "\r") {
      endWord();
      index += 1;
    } else {
      startWord();
      word.text += character;
      index += 1;
    }
  }
  endCommand();
  return commands;
}

function commandWords(words) {
  let start = 0;
  while (start < words.length) {
    const { text, unresolved } = words[start];
    if (SHELL_PREFIX_WORDS.has(text)) start += 1;
    else if (!unresolved && /^[A-Za-z_][A-Za-z0-9_]*=/.test(text)) start += 1;
    else if (text === "env") start += 1;
    else if (text === "timeout") {
      start += 1;
      while (start < words.length && words[start].text.startsWith("-")) start += 1;
      start += 1;
    } else break;
  }
  return words.slice(start);
}

function flagValue(args, index, inlineValue) {
  return inlineValue === undefined
    ? { value: args[index + 1], next: index + 1 }
    : { value: { ...args[index], text: inlineValue }, next: index };
}

function installsDependencies(args, workingDirectory) {
  let directory = workingDirectory;
  for (let index = 0; index < args.length; index += 1) {
    const { text } = args[index];
    const [flag, inlineValue] = text.split(/=(.*)/s);
    if (PNPM_DIRECTORY_FLAGS.has(flag)) {
      const { value, next } = flagValue(args, index, inlineValue);
      index = next;
      directory =
        directory === undefined || value === undefined
          ? undefined
          : insideRepository(directory, value.text);
    } else if (PNPM_FLAGS_WITH_VALUE.has(flag)) {
      index = flagValue(args, index, inlineValue).next;
    } else if (!text.startsWith("-")) {
      return (text === "install" || text === "i") && directory !== undefined;
    }
  }
  return false;
}

function nodeEntries(args) {
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

function wordPath(word, workingDirectory) {
  if (word.unresolved || workingDirectory === undefined) return undefined;
  if (word.text.startsWith(WORKSPACE)) {
    return insideRepository(".", `.${word.text.slice(WORKSPACE.length)}`);
  }
  return insideRepository(workingDirectory, word.text);
}

function packageName(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

function isLocal(specifier) {
  return (
    specifier.startsWith(WORKSPACE) ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier === "." ||
    specifier === ".."
  );
}

function literalText(node) {
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return undefined;
  return node.text.startsWith(GITHUB_SCRIPT_WORKSPACE)
    ? `${WORKSPACE}${node.text.slice(GITHUB_SCRIPT_WORKSPACE.length)}`
    : node.text;
}

function isWorkspaceVariable(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "GITHUB_WORKSPACE" &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "env" &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "process"
  );
}

function specifierText(node) {
  const literal = literalText(node);
  if (literal !== undefined) return literal;
  if (
    ts.isTemplateExpression(node) &&
    node.head.text === "" &&
    node.templateSpans.length === 1 &&
    isWorkspaceVariable(node.templateSpans[0].expression)
  ) {
    return `${WORKSPACE}${node.templateSpans[0].literal.text}`;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    isWorkspaceVariable(node.left)
  ) {
    const rest = literalText(node.right);
    return rest === undefined ? undefined : `${WORKSPACE}${rest}`;
  }
  return undefined;
}

// Only `import type` and `export type` are erased when Node strips a script's types; an import
// whose names are all marked `type` inline still loads its module.
function runtimeSpecifiers(module) {
  const sourceFile = ts.createSourceFile(module.path, module.source, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  const add = (node) => {
    const text =
      module.quote?.(node.getStart(sourceFile), node.getEnd()) ?? node.getText(sourceFile);
    specifiers.push({ specifier: specifierText(node), text });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) add(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier) add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
        add(node.moduleReference.expression);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callsImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const callsRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (callsImport || callsRequire) add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function isBuiltinSpecifier(specifier) {
  return specifier.startsWith("node:") || isBuiltin(specifier);
}

function localPath(module, specifier) {
  return specifier.startsWith(WORKSPACE)
    ? insideRepository(".", `.${specifier.slice(WORKSPACE.length)}`)
    : insideRepository(posix.dirname(module.path), specifier);
}

function resolvesInRepository(module, specifier) {
  if (isBuiltin(specifier) || PACKAGE_SPECIFIER.test(specifier)) return true;
  return (
    isLocal(specifier) && !specifier.includes("${{") && localPath(module, specifier) !== undefined
  );
}

// Walks a module's local imports depth first, in source order, and answers the first package it
// imports while no install has run, or the first local module that does not exist. Only a module
// that refuses unresolved paths answers an import whose path is not a literal, or is a literal
// that is neither a built-in, a package nor a path inside the repository.
function firstProblem(repository, module, installed, visited) {
  for (const { specifier, text } of runtimeSpecifiers(module)) {
    const resolved =
      specifier !== undefined &&
      (!module.refusesUnresolved || resolvesInRepository(module, specifier));
    if (!resolved) {
      if (module.refusesUnresolved) return { kind: "unresolved-import", text };
      continue;
    }
    if (isBuiltinSpecifier(specifier)) continue;
    if (!isLocal(specifier)) {
      if (installed) continue;
      return { kind: "package", name: packageName(specifier), via: module.path };
    }
    const path = localPath(module, specifier);
    if (path === undefined || visited.has(path)) continue;
    visited.add(path);
    const source = repository.read(path);
    if (source === undefined) return { kind: "missing-import", path, via: module.path };
    if (!SOURCE_EXTENSIONS.has(posix.extname(path))) continue;
    const problem = firstProblem(repository, { path, source }, installed, visited);
    if (problem) return problem;
  }
  return undefined;
}

function scriptProblem(repository, path, installed) {
  const source = repository.read(path);
  if (source === undefined) return { kind: "missing-script" };
  if (!SOURCE_EXTENSIONS.has(posix.extname(path))) return undefined;
  return firstProblem(repository, { path, source }, installed, new Set([path]));
}

function codeProblem(repository, module, installed) {
  const problem = firstProblem(repository, module, installed, new Set());
  return problem && { ...problem, via: problem.via === module.path ? undefined : problem.via };
}

function entryProblems(repository, entry, workingDirectory, installed) {
  if (entry.kind === "code") {
    if (workingDirectory === undefined)
      return [{ label: entry.label, problem: { kind: "unresolved", text: entry.label } }];
    const module = { path: posix.join(workingDirectory, "[eval]"), source: entry.code };
    return [{ label: entry.label, problem: codeProblem(repository, module, installed) }];
  }

  if (entry.kind === "default-tests") {
    if (workingDirectory === undefined)
      return [{ label: "node --test", problem: { kind: "unresolved", text: "node --test" } }];
    const files = [
      ...new Set(
        TEST_RUNNER_DEFAULT_PATTERNS.flatMap((pattern) =>
          repository.glob(posix.join(workingDirectory, pattern)),
        ),
      ),
    ]
      .filter((path) => !path.split("/").includes("node_modules"))
      .sort();
    return files.map((path) => ({
      label: path,
      problem: scriptProblem(repository, path, installed),
    }));
  }

  const { word } = entry;
  if (
    entry.kind === "preload" &&
    !word.unresolved &&
    !isLocal(word.text) &&
    !word.text.startsWith(WORKSPACE) &&
    !word.text.startsWith("/")
  ) {
    const problem =
      isBuiltinSpecifier(word.text) || installed
        ? undefined
        : { kind: "package", name: packageName(word.text) };
    return [{ label: entry.label, problem }];
  }

  const path = wordPath(word, workingDirectory);
  if (path === undefined)
    return [{ label: word.text, problem: { kind: "unresolved", text: word.text } }];

  if (entry.kind === "test-file" && GLOB_CHARACTERS.test(path)) {
    const files = repository.glob(path);
    if (files.length === 0) return [{ label: path, problem: { kind: "missing-script" } }];
    return files.map((file) => ({
      label: file,
      problem: scriptProblem(repository, file, installed),
    }));
  }

  return [{ label: entry.label ?? path, problem: scriptProblem(repository, path, installed) }];
}

function describeProblem(label, problem) {
  switch (problem.kind) {
    case "unresolved":
      return `runs node with a script path that cannot be resolved: ${problem.text}`;
    case "unresolved-import":
      return `runs ${label} with an import path that cannot be resolved: ${problem.text}`;
    case "missing-script":
      return `runs ${label}, which does not exist`;
    case "missing-import":
      return problem.via === undefined
        ? `runs ${label}, which imports ${problem.path}, which does not exist`
        : `runs ${label}, whose module ${problem.via} imports ${problem.path}, which does not exist`;
    default: {
      const through =
        problem.via === undefined || problem.via === label ? "" : ` through ${problem.via}`;
      return (
        `runs ${label}, which imports package ${problem.name}${through} ` +
        "with no dependency installation in an earlier step of the job"
      );
    }
  }
}

function stepLabel(doc, stepNode, fallback) {
  const name =
    resolveScalar(doc, stepNode.get("name", true)) ?? resolveScalar(doc, stepNode.get("id", true));
  return name === undefined ? fallback.trim().split("\n")[0] : String(name);
}

function githubScriptSource(doc, stepNode) {
  const uses = resolveScalar(doc, stepNode.get("uses", true));
  if (typeof uses !== "string" || !GITHUB_SCRIPT_ACTION.test(uses)) return undefined;
  const withNode = resolveNode(doc, stepNode.get("with", true));
  if (!isMap(withNode)) return undefined;
  const script = resolveScalar(doc, withNode.get("script", true));
  return typeof script === "string" ? { uses, script } : undefined;
}

// Replaces each workspace expression with a placeholder TypeScript reads as plain text, and
// quotes a range of the replaced source as the workflow wrote it.
function githubScriptModule(script) {
  const replacements = [];
  let source = "";
  let copied = 0;
  for (const match of script.matchAll(WORKSPACE_EXPRESSION)) {
    source += script.slice(copied, match.index) + GITHUB_SCRIPT_WORKSPACE;
    copied = match.index + match[0].length;
    replacements.push({ end: source.length, originalEnd: copied });
  }
  source += script.slice(copied);
  const original = (position) => {
    const before = replacements.findLast(({ end }) => end <= position);
    return before === undefined ? position : before.originalEnd + position - before.end;
  };
  return {
    path: "[github-script]",
    source,
    quote: (start, end) => script.slice(original(start), original(end)),
    refusesUnresolved: true,
  };
}

function checkWorkflow(path, doc, lineCounter, repository) {
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  if (!isMap(jobsNode)) return [];
  const workflowDirectory = defaultWorkingDirectory(doc, doc);

  const violations = [];
  for (const jobPair of jobsNode.items) {
    const jobNode = resolveNode(doc, jobPair.value);
    if (!isMap(jobNode)) continue;
    const stepsNode = resolveNode(doc, jobNode.get("steps", true));
    if (!isSeq(stepsNode)) continue;
    const jobDirectory = defaultWorkingDirectory(doc, jobNode) ?? workflowDirectory;

    let installed = false;
    for (const stepItem of stepsNode.items) {
      const stepNode = resolveNode(doc, stepItem);
      if (!isMap(stepNode)) continue;
      const violationOf = (fallback, label, problem) => ({
        path,
        line: lineCounter.linePos(stepNode.range[0]).line,
        message: `step "${stepLabel(doc, stepNode, fallback)}" of job ${jobPair.key.value} ${describeProblem(label, problem)}`,
      });

      const githubScript = githubScriptSource(doc, stepNode);
      if (githubScript !== undefined) {
        const problem = codeProblem(repository, githubScriptModule(githubScript.script), installed);
        if (problem)
          violations.push(violationOf(githubScript.uses, "actions/github-script", problem));
        continue;
      }

      const run = resolveScalar(doc, stepNode.get("run", true));
      if (typeof run !== "string") continue;
      const workingDirectory = resolveWorkingDirectory(
        resolveScalar(doc, stepNode.get("working-directory", true)) ?? jobDirectory,
      );

      for (const words of shellCommands(run)) {
        const [command, ...args] = commandWords(words);
        if (command?.text === "pnpm" && installsDependencies(args, workingDirectory))
          installed = true;
        if (command?.text !== "node") continue;

        for (const entry of nodeEntries(args)) {
          for (const { label, problem } of entryProblems(
            repository,
            entry,
            workingDirectory,
            installed,
          )) {
            if (problem !== undefined) violations.push(violationOf(run, label, problem));
          }
        }
      }
    }
  }
  return violations;
}

function fileSystemRepository(cwd = process.cwd()) {
  return {
    read(path) {
      try {
        return readFileSync(posix.join(cwd, path), "utf8");
      } catch {
        return undefined;
      }
    },
    glob: (pattern) => globSync(pattern, { cwd, exclude: ["**/node_modules/**"] }).sort(),
  };
}

export function checkFiles(paths, repository = fileSystemRepository()) {
  return paths.flatMap((path) => {
    const lineCounter = new LineCounter();
    const doc = parseDocument(repository.read(path), { lineCounter });
    if (doc.errors.length > 0) {
      const [error] = doc.errors;
      return [
        { path, line: error.linePos[0].line, message: `does not parse as YAML: ${error.message}` },
      ];
    }
    return checkWorkflow(path, doc, lineCounter, repository);
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
