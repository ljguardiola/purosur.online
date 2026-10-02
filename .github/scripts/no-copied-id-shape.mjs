import { globSync, readFileSync } from "node:fs";
import ts from "typescript";

export const ID_SHAPE_PATH = "packages/contracts/src/shared/record-id.ts";

const SCANNED_SOURCES = [
  "apps/cloud/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}",
  "packages/contracts/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}",
];
const ZOD_MODULE = /^zod(?:\/|$)/;
const ZOD_ID_FORMAT_NAME = /uuid|guid/i;
const ZOD_SCHEMA_ID_FORMATS = new Set(["uuid", "guid", "uuidv4", "uuidv6", "uuidv7"]);
const ZOD_NAMESPACES = new Set(["z", "default", "core", "regexes"]);

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

const UNKNOWN_VALUE = { kind: "unknown" };
const textValue = (pieces) => ({ kind: "text", pieces });

function textPiecesOfValue(value) {
  if (value.kind === "text") return value.pieces;
  if (value.kind === "number") return [String(value.number)];
  return [UNKNOWN_TEXT];
}

function sum(left, right) {
  if (left.kind === "text" || right.kind === "text") {
    return textValue([...textPiecesOfValue(left), ...textPiecesOfValue(right)]);
  }
  if (left.kind === "number" && right.kind === "number") {
    return { kind: "number", number: left.number + right.number };
  }
  return UNKNOWN_VALUE;
}

function evaluatorOf(constants) {
  const evaluate = (node, resolving = new Set(), raw = false) => {
    const textOf = (literal) => (raw ? literal.rawText : literal.text);
    if (ts.isStringLiteral(node)) return textValue([node.text]);
    if (ts.isNumericLiteral(node)) return { kind: "number", number: Number(node.text) };
    if (ts.isNoSubstitutionTemplateLiteral(node)) return textValue([textOf(node)]);
    if (ts.isParenthesizedExpression(node)) return evaluate(node.expression, resolving);
    if (ts.isTaggedTemplateExpression(node) && isStringRaw(node.tag)) {
      return evaluate(node.template, resolving, true);
    }
    if (ts.isIdentifier(node)) {
      const initializer = constants.get(node.text);
      if (initializer === undefined || resolving.has(node.text)) return UNKNOWN_VALUE;
      return evaluate(initializer, new Set([...resolving, node.text]));
    }
    if (ts.isTemplateExpression(node)) {
      return textValue([
        textOf(node.head),
        ...node.templateSpans.flatMap((span) => [
          ...textPiecesOfValue(evaluate(span.expression, resolving)),
          textOf(span.literal),
        ]),
      ]);
    }
    if (isConcatenation(node)) {
      return sum(evaluate(node.left, resolving), evaluate(node.right, resolving));
    }
    return UNKNOWN_VALUE;
  };
  return evaluate;
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
  const evaluate = evaluatorOf(constants);
  return nodes.flatMap((node) => {
    if (ts.isRegularExpressionLiteral(node)) return [{ node, ...regexLiteralPattern(node) }];
    if (!isStringExpression(node) || isInsideStringExpression(node)) return [];
    const value = evaluate(node);
    if (value.kind !== "text") return [];
    return knownTextRuns(value.pieces).map((pattern) => ({
      node,
      pattern,
      flagSets: STRING_FLAG_SETS,
    }));
  });
}

function zodImports(nodes) {
  const zodNames = new Set();
  const importedNames = new Set();
  const formatSpecifiers = [];
  for (const node of nodes) {
    if (!ts.isImportDeclaration(node) || !isFromZod(node)) continue;
    const clause = node.importClause;
    if (clause?.name) zodNames.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) zodNames.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        importedNames.add(element.name.text);
        const imported = (element.propertyName ?? element.name).text;
        if (namesIdFormat(imported)) formatSpecifiers.push(element);
        else zodNames.add(element.name.text);
      }
    }
  }
  return { zodNames, importedNames: new Set([...zodNames, ...importedNames]), formatSpecifiers };
}

function isFromZod(declaration) {
  const specifier = declaration.moduleSpecifier;
  return (
    specifier !== undefined && ts.isStringLiteral(specifier) && ZOD_MODULE.test(specifier.text)
  );
}

function isZodBinding(expression, zodBindings) {
  let node = expression;
  while (!ts.isIdentifier(node)) {
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      node = node.expression;
    } else {
      return false;
    }
  }
  return zodBindings.has(node.text);
}

function boundNames(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : boundNames(element.name),
  );
}

function zodBindingsOf(nodes, importedNames) {
  const zodBindings = new Set(importedNames);
  const declarations = nodes.filter(ts.isVariableDeclaration);
  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declarations) {
      if (!declaration.initializer || !isZodBinding(declaration.initializer, zodBindings)) continue;
      for (const name of boundNames(declaration.name)) {
        if (zodBindings.has(name)) continue;
        zodBindings.add(name);
        grew = true;
      }
    }
  }
  return zodBindings;
}

function isExported(declaration) {
  const statement = declaration.parent.parent;
  return (
    ts.isVariableStatement(statement) &&
    (statement.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function isReference(identifier) {
  const parent = identifier.parent;
  if (parent.propertyName === identifier) return false;
  if (parent.name === identifier) return ts.isShorthandPropertyAssignment(parent);
  return !(
    ts.isQualifiedName(parent) ||
    ts.isTypeQueryNode(parent) ||
    ts.isTypeReferenceNode(parent) ||
    ts.isExportSpecifier(parent)
  );
}

function isPassedThrough(parent, node) {
  return (
    (ts.isParenthesizedExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent)) &&
    parent.expression === node
  );
}

function isAccess(parent, node) {
  return (
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === node
  );
}

function isCalledOrAliased(parent, node) {
  return (
    ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node) ||
    (ts.isTaggedTemplateExpression(parent) && parent.tag === node) ||
    (ts.isVariableDeclaration(parent) && parent.initializer === node)
  );
}

function isUsedAsValue(identifier) {
  let node = identifier;
  while (isPassedThrough(node.parent, node) || isAccess(node.parent, node)) {
    if (isAccess(node.parent, node) && !holdsIdFormats(accessedName(node.parent))) {
      return false;
    }
    node = node.parent;
  }
  return !isCalledOrAliased(node.parent, node);
}

function zodValues(nodes, zodBindings) {
  return nodes.filter(
    (node) =>
      ts.isIdentifier(node) &&
      zodBindings.has(node.text) &&
      isReference(node) &&
      isUsedAsValue(node),
  );
}

function zodExports(nodes, zodBindings) {
  return nodes.flatMap((node) => {
    if (ts.isExportDeclaration(node)) {
      if (isFromZod(node)) return [node];
      if (node.moduleSpecifier || !node.exportClause || !ts.isNamedExports(node.exportClause)) {
        return [];
      }
      return node.exportClause.elements.filter((element) =>
        zodBindings.has((element.propertyName ?? element.name).text),
      );
    }
    if (ts.isExportAssignment(node)) {
      return isZodBinding(node.expression, zodBindings) ? [node] : [];
    }
    if (ts.isVariableDeclaration(node) && node.initializer && isExported(node)) {
      return isZodBinding(node.initializer, zodBindings) ? [node] : [];
    }
    return [];
  });
}

function reachedFromZod(expression, zodNames, constants, resolving = new Set()) {
  let node = expression;
  while (!ts.isIdentifier(node)) {
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      node = node.expression;
    } else {
      return false;
    }
  }
  if (zodNames.has(node.text)) return true;
  const initializer = constants.get(node.text);
  if (initializer === undefined || resolving.has(node.text)) return false;
  return reachedFromZod(initializer, zodNames, constants, new Set([...resolving, node.text]));
}

function accessedName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

function namesIdFormat(name) {
  return name !== undefined && ZOD_ID_FORMAT_NAME.test(name);
}

function holdsIdFormats(name) {
  return namesIdFormat(name) || ZOD_NAMESPACES.has(name);
}

function isZodIdFormat(name, expression, zodNames, zodBindings, constants) {
  return (
    (namesIdFormat(name) && isZodBinding(expression, zodBindings)) ||
    (ZOD_SCHEMA_ID_FORMATS.has(name) && reachedFromZod(expression, zodNames, constants))
  );
}

function destructuredFormats(node, zodNames, zodBindings, constants) {
  if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name)) return [];
  if (!node.initializer) return [];
  return node.name.elements.filter((element) => {
    const key = element.propertyName ?? element.name;
    return (
      (ts.isIdentifier(key) || ts.isStringLiteral(key)) &&
      isZodIdFormat(key.text, node.initializer, zodNames, zodBindings, constants)
    );
  });
}

function unknownMembers(nodes, zodBindings) {
  return nodes.filter(
    (node) =>
      ts.isElementAccessExpression(node) &&
      !ts.isStringLiteralLike(node.argumentExpression) &&
      isZodBinding(node.expression, zodBindings),
  );
}

function zodIdFormatsIn(nodes, constants) {
  const { zodNames, importedNames, formatSpecifiers } = zodImports(nodes);
  const zodBindings = zodBindingsOf(nodes, importedNames);
  const accesses = nodes.filter(
    (node) =>
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      isZodIdFormat(accessedName(node), node.expression, zodNames, zodBindings, constants),
  );
  const destructured = nodes.flatMap((node) =>
    destructuredFormats(node, zodNames, zodBindings, constants),
  );
  return [
    ...formatSpecifiers,
    ...accesses,
    ...destructured,
    ...unknownMembers(nodes, zodBindings),
    ...zodExports(nodes, zodBindings),
    ...zodValues(nodes, zodBindings),
  ];
}

export function findIdShapeCopies(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const nodes = descendants(sourceFile);
  const constants = constantInitializers(nodes);
  const copies = [
    ...patternsIn(nodes, constants)
      .filter(({ pattern, flagSets }) => flagSets.some((flags) => holdsTheShape(pattern, flags)))
      .map(({ node }) => node),
    ...zodIdFormatsIn(nodes, constants),
  ];
  const lines = copies.map(
    (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
  );
  return [...new Set(lines)].sort((a, b) => a - b).map((line) => ({ line }));
}

export function findScannedFiles(cwd = process.cwd()) {
  return globSync(SCANNED_SOURCES, { cwd })
    .filter((path) => path !== ID_SHAPE_PATH)
    .sort();
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findIdShapeCopies(readFile(path), path).map(
      ({ line }) =>
        `${path}:${line} holds a copy of the record id shape, which lives only in ${ID_SHAPE_PATH}`,
    ),
  );
}
