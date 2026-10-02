import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ID_SHAPE_PATH = "packages/contracts/src/shared/record-id.ts";

const SCANNED_SOURCES = [
  "apps/cloud/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}",
  "packages/contracts/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}",
];
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const COMPILER_OPTIONS_FROM = "apps/cloud/tsconfig.json";
const ZOD_PACKAGE_FILE = /\/node_modules\/zod\//;
const PACKAGE_FILE = /\/node_modules\//;
const ZOD_ID_FORMAT_NAME = /uuid|guid/i;

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

const realPaths = new Map();

function realPathOf(declaration) {
  const fileName = declaration.getSourceFile().fileName;
  let realPath = realPaths.get(fileName);
  if (realPath === undefined) {
    realPath = (ts.sys.realpath?.(fileName) ?? fileName).replaceAll("\\", "/");
    realPaths.set(fileName, realPath);
  }
  return realPath;
}

function isZodDeclaration(declaration) {
  return ZOD_PACKAGE_FILE.test(realPathOf(declaration));
}

function isDeclaredOnlyByPackages(symbol) {
  const declarations = symbol.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => PACKAGE_FILE.test(realPathOf(declaration)))
  );
}

function isMemberName(node) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isQualifiedName(parent) && parent.right === node)
  );
}

function isZodIdFormatSymbol(symbol, checker) {
  const target =
    symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return (
    target !== undefined &&
    ZOD_ID_FORMAT_NAME.test(target.name) &&
    (target.declarations ?? []).some(isZodDeclaration)
  );
}

function isZodIdFormat(node, checker) {
  if (isMemberName(node) && !ZOD_ID_FORMAT_NAME.test(node.text)) return false;
  return isZodIdFormatSymbol(checker.getSymbolAtLocation(node), checker);
}

function namesOfKeyType(type, checker) {
  const constraint = checker.getBaseConstraintOfType(type) ?? type;
  const types = constraint.isUnion() ? constraint.types : [constraint];
  return types.filter((each) => each.isStringLiteral()).map((each) => each.value);
}

function namesOfKey(key, checker) {
  if (ts.isComputedPropertyName(key)) {
    return namesOfKeyType(checker.getTypeAtLocation(key.expression), checker);
  }
  return [key.text];
}

function isAssignment(node) {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
}

function typesOfNamedEntries(types, names, checker) {
  return types.flatMap((type) =>
    names.flatMap((name) => {
      const property = checker.getPropertyOfType(type, name);
      return property === undefined ? [] : [checker.getTypeOfSymbol(property)];
    }),
  );
}

function returnTypesOf(types, checker) {
  return types.flatMap((type) =>
    type.getCallSignatures().map((signature) => checker.getReturnTypeOfSignature(signature)),
  );
}

function iteratedTypes(type, checker) {
  const iterator = checker
    .getPropertiesOfType(checker.getApparentType(type))
    .find((property) => String(property.escapedName).startsWith("__@iterator"));
  if (iterator === undefined) return [];
  const iterators = returnTypesOf([checker.getTypeOfSymbol(iterator)], checker);
  const results = returnTypesOf(typesOfNamedEntries(iterators, ["next"], checker), checker);
  const members = results.flatMap((result) => (result.isUnion() ? result.types : [result]));
  return typesOfNamedEntries(members, ["value"], checker);
}

function typesAtIndex(types, index, checker) {
  return types.flatMap((type) => {
    const [indexed] = typesOfNamedEntries([type], [String(index)], checker);
    const element = indexed ?? checker.getIndexTypeOfType(type, ts.IndexKind.Number);
    return element === undefined ? iteratedTypes(type, checker) : [element];
  });
}

function restOf(pattern) {
  const parent = pattern.parent;
  return ts.isSpreadElement(parent) && isAssignedPattern(parent.parent) ? parent : undefined;
}

function elementTypesOf(pattern, index, checker) {
  const rest = restOf(pattern);
  if (rest === undefined)
    return typesAtIndex(sourceTypesOfPattern(pattern, checker), index, checker);
  const list = rest.parent;
  return elementTypesOf(list, list.elements.indexOf(rest) + index, checker);
}

function typesOfEntry(entry, checker) {
  const pattern = entry.parent;
  if (ts.isArrayLiteralExpression(pattern)) {
    return elementTypesOf(pattern, pattern.elements.indexOf(entry), checker);
  }
  const names = namesOfKey(entry.name, checker);
  if (restOf(pattern) !== undefined) {
    return names
      .filter((name) => /^\d+$/.test(name))
      .flatMap((name) => elementTypesOf(pattern, Number(name), checker));
  }
  return typesOfNamedEntries(sourceTypesOfPattern(pattern, checker), names, checker);
}

function enclosingEntry(node) {
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return isAssignedPattern(parent.parent) ? parent : undefined;
  }
  return ts.isArrayLiteralExpression(parent) && isAssignedPattern(parent) ? node : undefined;
}

function isAssignedPattern(node) {
  if (!ts.isObjectLiteralExpression(node) && !ts.isArrayLiteralExpression(node)) return false;
  const parent = node.parent;
  return (
    (ts.isForOfStatement(parent) && parent.initializer === node) ||
    (isAssignment(parent) && parent.left === node) ||
    restOf(node) !== undefined ||
    enclosingEntry(node) !== undefined
  );
}

function entryHolding(pattern) {
  const parent = pattern.parent;
  return enclosingEntry(isAssignment(parent) && parent.left === pattern ? parent : pattern);
}

function isInsideRest(pattern) {
  if (restOf(pattern) !== undefined) return true;
  const entry = entryHolding(pattern);
  return entry !== undefined && isInsideRest(entry.parent);
}

function sourceTypesOfAssignedPattern(pattern, checker) {
  const entry = entryHolding(pattern);
  const entryTypes = entry === undefined ? [] : typesOfEntry(entry, checker);
  if (isInsideRest(pattern)) return entryTypes;
  return [checker.getTypeOfAssignmentPattern(pattern), ...entryTypes];
}

function sourceTypesOfPattern(pattern, checker) {
  if (ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern)) {
    return [checker.getTypeAtLocation(pattern)];
  }
  return isAssignedPattern(pattern) ? sourceTypesOfAssignedPattern(pattern, checker) : [];
}

function destructuredKey(node) {
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    return node.propertyName ?? node.name;
  }
  if (
    (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
    isAssignedPattern(node.parent)
  ) {
    return node.name;
  }
  return undefined;
}

function destructuresZodIdFormat(entry, key, checker) {
  const names = namesOfKey(key, checker);
  return sourceTypesOfPattern(entry.parent, checker).some((source) =>
    names.some((name) => isZodIdFormatSymbol(checker.getPropertyOfType(source, name), checker)),
  );
}

function namesZodIdFormat(node, checker) {
  const object = checker.getTypeFromTypeNode(node.objectType);
  return namesOfKeyType(checker.getTypeFromTypeNode(node.indexType), checker).some((name) =>
    isZodIdFormatSymbol(checker.getPropertyOfType(object, name), checker),
  );
}

function picksZodIdFormat(node, checker) {
  const receiver = checker.getTypeAtLocation(node.expression);
  return namesOfKeyType(checker.getTypeAtLocation(node.argumentExpression), checker).some((name) =>
    isZodIdFormatSymbol(checker.getPropertyOfType(receiver, name), checker),
  );
}

function calleeOf(node) {
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) return node.expression;
  if (ts.isTaggedTemplateExpression(node)) return node.tag;
  return undefined;
}

function isZodIdFormatSignature(signature) {
  const declaration = signature.getDeclaration();
  const name = declaration === undefined ? undefined : ts.getNameOfDeclaration(declaration);
  return (
    name !== undefined && ZOD_ID_FORMAT_NAME.test(name.getText()) && isZodDeclaration(declaration)
  );
}

function callsZodIdFormat(node, checker) {
  const callee = calleeOf(node);
  if (callee === undefined) return false;
  const type = checker.getTypeAtLocation(callee);
  return [...type.getCallSignatures(), ...type.getConstructSignatures()].some(
    isZodIdFormatSignature,
  );
}

function membersOf(type, checker) {
  const apparent = checker.getApparentType(type);
  if (!apparent.isUnionOrIntersection()) return [apparent];
  return apparent.types.flatMap((member) => membersOf(member, checker));
}

function declaredParameterType(argument, checker) {
  const call = argument.parent;
  if (!(ts.isCallExpression(call) || ts.isNewExpression(call))) return undefined;
  const index = call.arguments?.indexOf(argument) ?? -1;
  if (index === -1) return undefined;
  const parameters = checker.getResolvedSignature(call)?.getDeclaration()?.parameters ?? [];
  const parameter = parameters[Math.min(index, parameters.length - 1)];
  if (parameter === undefined) return undefined;
  const type = checker.getTypeAtLocation(parameter);
  if (parameter.dotDotDotToken === undefined) return type;
  return checker.getIndexTypeOfType(checker.getApparentType(type), ts.IndexKind.Number);
}

function isOfZod(symbol) {
  return (symbol.declarations ?? []).some(isZodDeclaration);
}

function numberIndexOf(type, checker) {
  const index = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  return index === undefined ? [] : [index];
}

function returnsOf(type, checker) {
  return type.getCallSignatures().map((signature) => checker.getReturnTypeOfSignature(signature));
}

function nestedEntriesOf(type, checker) {
  return [
    ...checker
      .getPropertiesOfType(type)
      .filter((property) => !isDeclaredOnlyByPackages(property))
      .map((property) => ({
        type: checker.getTypeOfSymbol(property),
        inSource: (source) => {
          const same = checker.getPropertyOfType(source, property.name);
          return same === undefined ? [] : [checker.getTypeOfSymbol(same)];
        },
      })),
    ...numberIndexOf(type, checker).map((index) => ({
      type: index,
      inSource: (source) => numberIndexOf(source, checker),
    })),
    ...returnsOf(type, checker).map((result) => ({
      type: result,
      inSource: (source) => returnsOf(source, checker),
    })),
  ];
}

function namesForeignIdFormat(type, checker) {
  return checker
    .getPropertiesOfType(type)
    .some((property) => ZOD_ID_FORMAT_NAME.test(property.name) && !isOfZod(property));
}

function reachesForeignIdFormat(type, checker, visited) {
  if (visited.has(type)) return false;
  visited.add(type);
  return membersOf(type, checker).some(
    (member) =>
      namesForeignIdFormat(member, checker) ||
      nestedEntriesOf(member, checker).some((entry) =>
        reachesForeignIdFormat(entry.type, checker, visited),
      ),
  );
}

const foreignIdFormatsByType = new WeakMap();

function holdsForeignIdFormat(type, checker) {
  if (!foreignIdFormatsByType.has(type)) {
    foreignIdFormatsByType.set(type, reachesForeignIdFormat(type, checker, new Set()));
  }
  return foreignIdFormatsByType.get(type);
}

function holdsZodIdFormatNamed(name, sources, checker) {
  return sources.some((source) =>
    membersOf(source, checker).some((member) =>
      isZodIdFormatSymbol(checker.getPropertyOfType(member, name), checker),
    ),
  );
}

function upcastsZodIdFormat(target, sources, checker, { nested = true, visited = new Map() } = {}) {
  if (sources.length === 0 || !holdsForeignIdFormat(target, checker)) return false;
  const seen = visited.get(target) ?? new Set();
  visited.set(target, seen);
  const fresh = sources.filter((source) => !seen.has(source));
  if (fresh.length === 0) return false;
  for (const source of fresh) seen.add(source);
  return membersOf(target, checker).some(
    (member) =>
      checker
        .getPropertiesOfType(member)
        .some(
          (property) =>
            ZOD_ID_FORMAT_NAME.test(property.name) &&
            !isOfZod(property) &&
            holdsZodIdFormatNamed(property.name, fresh, checker),
        ) ||
      (nested &&
        nestedEntriesOf(member, checker).some((entry) =>
          upcastsZodIdFormat(
            entry.type,
            fresh.flatMap((source) =>
              membersOf(source, checker).flatMap((each) => entry.inSource(each)),
            ),
            checker,
            { visited },
          ),
        )),
  );
}

function isGivenValue(node) {
  if (!ts.isExpression(node) || isMemberName(node) || ts.isLiteralExpression(node)) return false;
  const parent = node.parent;
  return (
    !ts.isIdentifier(node) ||
    ts.isShorthandPropertyAssignment(parent) ||
    ts.getNameOfDeclaration(parent) !== node
  );
}

function givesZodIdFormatAsValue(node, contextual, checker) {
  const literal = ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node);
  const declared = declaredParameterType(node, checker);
  const targets = [
    { type: contextual, nested: !literal },
    { type: declared, nested: !literal || declared !== contextual },
  ].filter(({ type }) => type !== undefined && holdsForeignIdFormat(type, checker));
  if (targets.length === 0) return false;
  const source = checker.getTypeAtLocation(node);
  return targets.some(({ type, nested }) =>
    upcastsZodIdFormat(type, [source], checker, { nested }),
  );
}

function parameterTypesOf(signature, checker) {
  return signature.getParameters().map((parameter) => checker.getTypeOfSymbol(parameter));
}

function receivesZodIdFormatAsParameter(node, contextual, checker) {
  const given = membersOf(contextual, checker).flatMap((member) =>
    member.getCallSignatures().map((signature) => parameterTypesOf(signature, checker)),
  );
  if (given.length === 0) return false;
  const receivers = checker
    .getTypeAtLocation(node)
    .getCallSignatures()
    .flatMap((signature) =>
      parameterTypesOf(signature, checker).map((type, index) => ({ type, index })),
    );
  return receivers.some(
    ({ type, index }) =>
      holdsForeignIdFormat(type, checker) &&
      upcastsZodIdFormat(
        type,
        given.flatMap((parameters) => parameters[index] ?? []),
        checker,
      ),
  );
}

function givesZodIdFormatToAnotherType(node, checker) {
  if (!isGivenValue(node)) return false;
  const contextual = checker.getContextualType(node);
  if (contextual !== undefined && receivesZodIdFormatAsParameter(node, contextual, checker)) {
    return true;
  }
  return !ts.isFunctionLike(node) && givesZodIdFormatAsValue(node, contextual, checker);
}

function isKeyOfPattern(node) {
  return destructuredKey(node.parent) === node;
}

function zodIdFormatsIn(nodes, checker) {
  return nodes.flatMap((node) => {
    const key = destructuredKey(node);
    if (key !== undefined) {
      if (!destructuresZodIdFormat(node, key, checker)) return [];
      return [ts.isComputedPropertyName(key) ? key.expression : key];
    }
    if (callsZodIdFormat(node, checker)) return [node];
    if (givesZodIdFormatToAnotherType(node, checker)) return [node];
    if (ts.isIndexedAccessTypeNode(node) && namesZodIdFormat(node, checker)) return [node];
    if (ts.isElementAccessExpression(node) && picksZodIdFormat(node, checker)) {
      return [node.argumentExpression];
    }
    if (ts.isIdentifier(node) && !isKeyOfPattern(node) && isZodIdFormat(node, checker)) {
      return [node];
    }
    return [];
  });
}

function compilerOptionsOf(root) {
  const parsed = ts.getParsedCommandLineOfConfigFile(join(root, COMPILER_OPTIONS_FROM), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  return {
    ...parsed.options,
    allowJs: true,
    noEmit: true,
    composite: false,
    declaration: false,
    incremental: false,
    rootDir: undefined,
    outDir: undefined,
    tsBuildInfoFile: undefined,
  };
}

const diskSourceFiles = new Map();

function hostServing(sources, options) {
  const host = ts.createCompilerHost(options, true);
  const readDiskSourceFile = host.getSourceFile;
  return {
    ...host,
    fileExists: (fileName) => sources.has(fileName) || host.fileExists(fileName),
    readFile: (fileName) => sources.get(fileName) ?? host.readFile(fileName),
    getSourceFile: (fileName, languageVersion, ...rest) => {
      if (sources.has(fileName)) {
        return ts.createSourceFile(fileName, sources.get(fileName), languageVersion, true);
      }
      const key = `${fileName}\0${JSON.stringify(languageVersion)}`;
      if (!diskSourceFiles.has(key)) {
        diskSourceFiles.set(key, readDiskSourceFile(fileName, languageVersion, ...rest));
      }
      return diskSourceFiles.get(key);
    },
  };
}

export function findIdShapeCopies(sources, root = REPO_ROOT) {
  const byFileName = new Map(
    Object.entries(sources).map(([path, source]) => [join(root, path), source]),
  );
  const options = compilerOptionsOf(root);
  const program = ts.createProgram({
    rootNames: [...byFileName.keys()],
    options,
    host: hostServing(byFileName, options),
  });
  const checker = program.getTypeChecker();
  return Object.keys(sources).flatMap((path) => {
    const sourceFile = program.getSourceFile(join(root, path));
    const nodes = descendants(sourceFile);
    const copies = [
      ...patternsIn(nodes, constantInitializers(nodes))
        .filter(({ pattern, flagSets }) => flagSets.some((flags) => holdsTheShape(pattern, flags)))
        .map(({ node }) => node),
      ...zodIdFormatsIn(nodes, checker),
    ];
    const lines = copies.map(
      (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    );
    return [...new Set(lines)].sort((a, b) => a - b).map((line) => ({ path, line }));
  });
}

export function findScannedFiles(cwd = REPO_ROOT) {
  return globSync(SCANNED_SOURCES, { cwd }).sort();
}

export function checkFiles(
  paths,
  readFile = (path) => readFileSync(join(REPO_ROOT, path), "utf8"),
  root = REPO_ROOT,
) {
  const sources = Object.fromEntries(paths.map((path) => [path, readFile(path)]));
  return findIdShapeCopies(sources, root)
    .filter(({ path }) => path !== ID_SHAPE_PATH)
    .map(
      ({ path, line }) =>
        `${path}:${line} holds a copy of the record id shape, which lives only in ${ID_SHAPE_PATH}`,
    );
}
