import { globSync, readFileSync } from "node:fs";
import ts from "typescript";

export const ID_SHAPE_PATH = "apps/cloud/src/platform/db/uuid-pattern.ts";

const HEX_DIGITS = [..."0123456789abcdef"];
const PATTERN_FLAGS = new Set(["i", "m", "s", "u", "v"]);
const STRING_FLAG_SETS = ["", "u"];
const SUB_PATTERN_STARTS = new Set(["[", "\\", "(", "."]);
const SUB_PATTERN_ENDS = new Set(["]", "}", ")", "*", "+", "?", "."]);
const QUANTIFIER = /[{*+]/;
const VARIABLE_ATOM = /[[\\.|]/g;
const DIFFERING_SAMPLE_POSITIONS = 30;

// The version and variant nibbles vary so that a copy pinned to one UUID version is still found,
// and the two samples differ in every other position so that no single UUID value matches both.
function samplesFor(version, variant) {
  return [
    `0123abcd-ef01-${version}567-${variant}9ab-cdef01234567`,
    `fedcba98-7654-${version}a21-${variant}a98-76543210fedc`,
  ];
}

function mutationsOf(uuid, nonHex) {
  const groups = uuid.split("-");
  return groups.flatMap((group, index) => {
    const withGroup = (replacement) => groups.toSpliced(index, 1, replacement).join("-");
    return [
      withGroup(group.slice(0, -1)),
      withGroup(`${group}0`),
      withGroup(`${group.slice(0, -1)}${nonHex}`),
    ];
  });
}

function acceptedSample(regex) {
  for (const toCase of [(text) => text, (text) => text.toUpperCase()]) {
    for (const version of HEX_DIGITS) {
      for (const variant of HEX_DIGITS) {
        const [sample, other] = samplesFor(version, variant).map(toCase);
        if (regex.test(sample) && regex.test(other)) return { sample, nonHex: toCase("g") };
      }
    }
  }
  return undefined;
}

function compiled(pattern, flags) {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return undefined;
  }
}

function recognizesTheShape(subPattern, flags) {
  if (compiled(subPattern, flags) === undefined) return false;
  const regex = compiled(`^(?:${subPattern})$`, flags);
  if (regex === undefined) return false;
  const accepted = acceptedSample(regex);
  if (accepted === undefined) return false;
  return mutationsOf(accepted.sample, accepted.nonHex).every((mutation) => !regex.test(mutation));
}

function endsWithVariableAtom(pattern, end) {
  return SUB_PATTERN_ENDS.has(pattern[end - 1]) || pattern[end - 2] === "\\";
}

// Two samples differing in 30 positions are both accepted only by a pattern that repeats an atom or
// spells out a class, an escape, a dot or an alternative for each of those positions.
function mayAcceptBothSamples(pattern) {
  return (
    QUANTIFIER.test(pattern) ||
    (pattern.match(VARIABLE_ATOM)?.length ?? 0) >= DIFFERING_SAMPLE_POSITIONS
  );
}

function holdsTheShape(pattern, flags) {
  if (!mayAcceptBothSamples(pattern)) return false;
  for (let start = 0; start < pattern.length; start++) {
    if (!SUB_PATTERN_STARTS.has(pattern[start])) continue;
    for (let end = start + 1; end <= pattern.length; end++) {
      if (!endsWithVariableAtom(pattern, end)) continue;
      if (recognizesTheShape(pattern.slice(start, end), flags)) return true;
    }
  }
  return false;
}

function descendants(node) {
  const nodes = [];
  const visit = (child) => {
    nodes.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return nodes;
}

function constantInitializers(nodes) {
  const initializers = new Map();
  for (const node of nodes) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      node.parent.flags & ts.NodeFlags.Const
    ) {
      const name = node.name.text;
      initializers.set(name, initializers.has(name) ? undefined : node.initializer);
    }
  }
  return initializers;
}

function stringEvaluator(constants) {
  const evaluate = (node, resolving = new Set()) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isParenthesizedExpression(node)) return evaluate(node.expression, resolving);
    if (ts.isIdentifier(node)) {
      const initializer = constants.get(node.text);
      if (initializer === undefined || resolving.has(node.text)) return undefined;
      return evaluate(initializer, new Set([...resolving, node.text]));
    }
    if (ts.isTemplateExpression(node)) {
      let text = node.head.text;
      for (const span of node.templateSpans) {
        const value = evaluate(span.expression, resolving);
        if (value === undefined) return undefined;
        text += value + span.literal.text;
      }
      return text;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = evaluate(node.left, resolving);
      const right = evaluate(node.right, resolving);
      return left === undefined || right === undefined ? undefined : left + right;
    }
    return undefined;
  };
  return evaluate;
}

function enclosingStringExpression(node) {
  const parent = node.parent;
  if (ts.isTemplateSpan(parent)) return parent.parent;
  if (
    ts.isParenthesizedExpression(parent) ||
    (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken)
  ) {
    return parent;
  }
  return undefined;
}

function regexLiteralPattern(node) {
  const text = node.text;
  const lastSlash = text.lastIndexOf("/");
  const flags = [...text.slice(lastSlash + 1)].filter((flag) => PATTERN_FLAGS.has(flag)).join("");
  return { pattern: text.slice(1, lastSlash), flagSets: [flags] };
}

function patternsIn(nodes, constants) {
  const evaluate = stringEvaluator(constants);
  return nodes.flatMap((node) => {
    if (ts.isRegularExpressionLiteral(node)) return [{ node, ...regexLiteralPattern(node) }];
    if (ts.isIdentifier(node)) return [];
    const text = evaluate(node);
    if (text === undefined) return [];
    const enclosing = enclosingStringExpression(node);
    if (enclosing !== undefined && evaluate(enclosing) !== undefined) return [];
    return [{ node, pattern: text, flagSets: STRING_FLAG_SETS }];
  });
}

export function findIdShapeCopies(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const nodes = descendants(sourceFile);
  const lines = patternsIn(nodes, constantInitializers(nodes))
    .filter(({ pattern, flagSets }) => flagSets.some((flags) => holdsTheShape(pattern, flags)))
    .map(
      ({ node }) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    );
  return [...new Set(lines)].sort((a, b) => a - b).map((line) => ({ line }));
}

export function findScannedFiles(cwd = process.cwd()) {
  return globSync("apps/cloud/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}", { cwd })
    .filter((path) => path !== ID_SHAPE_PATH)
    .sort();
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findIdShapeCopies(readFile(path), path).map(
      ({ line }) =>
        `${path}:${line} holds a copy of the database id shape, which lives only in ${ID_SHAPE_PATH}`,
    ),
  );
}
