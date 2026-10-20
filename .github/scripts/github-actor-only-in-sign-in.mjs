import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument, Scalar } from "yaml";

const ACTOR_MESSAGE =
  "reads github.actor or github.actor_id (GITHUB_ACTOR, GITHUB_ACTOR_ID), which keep naming " +
  "whoever first triggered the run when someone else re-runs it; only a registry sign-in " +
  "username may use github.actor, so use github.triggering_actor when the value decides who may act";

const EXPRESSION_RE = /\$\{\{([\s\S]*?)\}\}/g;
const ACTOR_EXPRESSION_RE =
  /(?<![\w.-])github\s*(?:\.\s*(actor(?:_id)?)|\[\s*['"](actor(?:_id)?)['"]\s*\])(?![\w-])/gi;
const ACTOR_VARIABLE_RE = /(?<!\w)GITHUB_(ACTOR(?:_ID)?)(?!\w)/g;
const LOGIN_ACTION_RE = /^[^/@]+\/(?:[^/@]*-)?login(?:-action)?(?=[/@])/i;
const COMMAND_RE = /[^|;&\n]+/g;
const SIGN_IN_COMMAND_RE = /^\s*(?:docker|skopeo)\s+login(?!\S)/;
const USERNAME_OPTION_RE =
  /(?<=\s)(?:--username|-u)(?:=|\s+)("[^"]*"|'[^']*'|\$\{\{[\s\S]*?\}\}|\S+)/g;

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : resolved;
}

function actorReferencesIn(text, offset) {
  return [...text.matchAll(ACTOR_EXPRESSION_RE)].map((match) => ({
    index: offset + match.index,
    isActorId: (match[1] ?? match[2]).toLowerCase() === "actor_id",
  }));
}

function referencesOf(text, wholeTextIsExpression) {
  const expressionReferences = wholeTextIsExpression
    ? actorReferencesIn(text, 0)
    : [...text.matchAll(EXPRESSION_RE)].flatMap((match) =>
        actorReferencesIn(match[1], match.index + 3),
      );
  const variableReferences = [...text.matchAll(ACTOR_VARIABLE_RE)].map((match) => ({
    index: match.index,
    isActorId: match[1] === "ACTOR_ID",
  }));
  return [...expressionReferences, ...variableReferences];
}

function signInUsernameSpansOf(script) {
  const joined = script.replace(/\\\r?\n/g, (continuation) => " ".repeat(continuation.length));
  return [...joined.matchAll(COMMAND_RE)]
    .filter((command) => SIGN_IN_COMMAND_RE.test(command[0]))
    .flatMap((command) =>
      [...command[0].matchAll(USERNAME_OPTION_RE)].map((option) => {
        const start = command.index + option.index + option[0].length - option[1].length;
        return { start, end: start + option[1].length };
      }),
    );
}

function isStepPath(path) {
  return path.length >= 5 && path[0] === "jobs" && path[2] === "steps";
}

function contextOf(doc, path, ancestors) {
  const last = path.at(-1);
  if (path.length === 3 && path[0] === "jobs" && last === "if") return "condition";
  if (!isStepPath(path)) return "other";
  if (path.length === 5 && last === "if") return "condition";
  if (path.length === 5 && last === "run") return "run";
  if (path.length === 6 && path[4] === "with" && last === "username") {
    const uses = resolveScalar(doc, ancestors[4].get("uses", true));
    if (typeof uses === "string" && LOGIN_ACTION_RE.test(uses)) return "sign-in username";
  }
  return "other";
}

function contentStartOf(node, source) {
  const [start] = node.range;
  if (node.type === Scalar.BLOCK_LITERAL || node.type === Scalar.BLOCK_FOLDED) {
    return source.indexOf("\n", start) + 1;
  }
  if (node.type === Scalar.QUOTE_DOUBLE || node.type === Scalar.QUOTE_SINGLE) return start + 1;
  return start;
}

function sourceOffsetOf(text, index, node, source) {
  const end = node.range[1];
  let cursor = contentStartOf(node, source);
  for (const char of text.slice(0, index + 1)) {
    if (/\s/.test(char)) continue;
    const found = source.indexOf(char, cursor);
    if (found === -1 || found >= end) return node.range[0];
    cursor = found + 1;
  }
  return cursor - 1;
}

function lineOfReference(text, index, valueNode, siteNode, { source, lineCounter }) {
  const offset =
    siteNode === valueNode ? sourceOffsetOf(text, index, valueNode, source) : siteNode.range[0];
  return lineCounter.linePos(offset).line;
}

function violatingReferences(text, context) {
  const references = referencesOf(text, context === "condition");
  if (context === "sign-in username") return references.filter((ref) => ref.isActorId);
  if (context !== "run") return references;
  const spans = signInUsernameSpansOf(text);
  return references.filter(
    (ref) =>
      ref.isActorId || !spans.some(({ start, end }) => ref.index >= start && ref.index < end),
  );
}

function scalarViolationLines(doc, valueNode, siteNode, path, ancestors, workflow) {
  const text = valueNode.value;
  if (typeof text !== "string") return [];
  const context = contextOf(doc, path, ancestors);
  return violatingReferences(text, context).map((ref) =>
    lineOfReference(text, ref.index, valueNode, siteNode, workflow),
  );
}

function violationLinesOf(workflow) {
  const { doc } = workflow;
  const lines = [];
  const visiting = new Set();

  function visit(itemNode, path, ancestors, aliasSite) {
    const node = resolveNode(doc, itemNode);
    if (!node || visiting.has(node)) return;
    const siteNode = aliasSite ?? itemNode;
    if (isScalar(node)) {
      lines.push(...scalarViolationLines(doc, node, siteNode, path, ancestors, workflow));
      return;
    }
    const childAliasSite = siteNode === node ? undefined : siteNode;
    visiting.add(node);
    if (isMap(node)) {
      for (const pair of node.items) {
        const key = resolveScalar(doc, pair.key);
        visit(pair.value, [...path, key], [...ancestors, node], childAliasSite);
      }
    } else if (isSeq(node)) {
      for (const [index, item] of node.items.entries()) {
        visit(item, [...path, index], [...ancestors, node], childAliasSite);
      }
    }
    visiting.delete(node);
  }

  visit(doc.contents, [], []);
  return [...new Set(lines)].sort((a, b) => a - b);
}

function parseWorkflow(source) {
  const lineCounter = new LineCounter();
  return { doc: parseDocument(source, { lineCounter }), lineCounter, source };
}

export function findActorViolations(source) {
  return violationLinesOf(parseWorkflow(source)).map((line) => ({ line, message: ACTOR_MESSAGE }));
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
    return violationLinesOf(workflow).map((line) => ({ path, line, message: ACTOR_MESSAGE }));
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
