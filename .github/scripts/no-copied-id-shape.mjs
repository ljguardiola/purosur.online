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

const UNKNOWN_TEXT = Symbol("unknown text");

function isStringRaw(tag) {
  return (
    ts.isPropertyAccessExpression(tag) &&
    ts.isIdentifier(tag.expression) &&
    tag.expression.text === "String" &&
    tag.name.text === "raw"
  );
}

function isConcatenation(node) {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function isStringExpression(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    (ts.isTaggedTemplateExpression(node) && isStringRaw(node.tag)) ||
    ts.isParenthesizedExpression(node) ||
    isConcatenation(node)
  );
}

function isInsideStringExpression(node) {
  const parent = node.parent;
  return (
    ts.isTemplateSpan(parent) ||
    ts.isParenthesizedExpression(parent) ||
    isConcatenation(parent) ||
    (ts.isTaggedTemplateExpression(parent) && isStringRaw(parent.tag))
  );
}

function textPieces(constants) {
  const piecesOf = (node, resolving = new Set(), raw = false) => {
    const textOf = (literal) => (raw ? literal.rawText : literal.text);
    if (ts.isStringLiteral(node)) return [node.text];
    if (ts.isNoSubstitutionTemplateLiteral(node)) return [textOf(node)];
    if (ts.isParenthesizedExpression(node)) return piecesOf(node.expression, resolving);
    if (ts.isTaggedTemplateExpression(node) && isStringRaw(node.tag)) {
      return piecesOf(node.template, resolving, true);
    }
    if (ts.isIdentifier(node)) {
      const initializer = constants.get(node.text);
      if (initializer === undefined || resolving.has(node.text)) return [UNKNOWN_TEXT];
      return piecesOf(initializer, new Set([...resolving, node.text]));
    }
    if (ts.isTemplateExpression(node)) {
      return [
        textOf(node.head),
        ...node.templateSpans.flatMap((span) => [
          ...piecesOf(span.expression, resolving),
          textOf(span.literal),
        ]),
      ];
    }
    if (isConcatenation(node)) {
      return [...piecesOf(node.left, resolving), ...piecesOf(node.right, resolving)];
    }
    return [UNKNOWN_TEXT];
  };
  return piecesOf;
}

function knownTextRuns(pieces) {
  const runs = [""];
  for (const piece of pieces) {
    if (piece === UNKNOWN_TEXT) runs.push("");
    else runs[runs.length - 1] += piece;
  }
  return runs.filter((run) => run !== "");
}

function regexLiteralPattern(node) {
  const text = node.text;
  const lastSlash = text.lastIndexOf("/");
  const flags = [...text.slice(lastSlash + 1)].filter((flag) => PATTERN_FLAGS.has(flag)).join("");
  return { pattern: text.slice(1, lastSlash), flagSets: [flags] };
}

function patternsIn(nodes, constants) {
  const piecesOf = textPieces(constants);
  return nodes.flatMap((node) => {
    if (ts.isRegularExpressionLiteral(node)) return [{ node, ...regexLiteralPattern(node) }];
    if (!isStringExpression(node) || isInsideStringExpression(node)) return [];
    return knownTextRuns(piecesOf(node)).map((pattern) => ({
      node,
      pattern,
      flagSets: STRING_FLAG_SETS,
    }));
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
