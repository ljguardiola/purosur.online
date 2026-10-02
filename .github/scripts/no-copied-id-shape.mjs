import { globSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ID_SHAPE_PATH = "packages/contracts/src/shared/record-id.ts";

const SCANNED_PACKAGES = ["apps/cloud", "packages/contracts"];
const SCANNED_SOURCES = SCANNED_PACKAGES.map(
  (scanned) => `${scanned}/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}`,
);
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const COMPILER_OPTIONS_FROM = "apps/cloud/tsconfig.json";
const ZOD_PACKAGE_FILE = /\/node_modules\/zod\//;
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

function literalNamesOfType(type, checker) {
  const constraint = checker.getBaseConstraintOfType(type) ?? type;
  const types = constraint.isUnion() ? constraint.types : [constraint];
  return types.filter((each) => each.isStringLiteral()).map((each) => each.value);
}

function isZodIdFormatSignature(signature) {
  const declaration = signature.getDeclaration();
  const name = declaration === undefined ? undefined : ts.getNameOfDeclaration(declaration);
  return (
    name !== undefined && ZOD_ID_FORMAT_NAME.test(name.getText()) && isZodDeclaration(declaration)
  );
}

function isZodIdFormatType(type) {
  if (type.isUnionOrIntersection()) return type.types.some(isZodIdFormatType);
  return [...type.getCallSignatures(), ...type.getConstructSignatures()].some(
    isZodIdFormatSignature,
  );
}

function zodIdFormatsIn(nodes, checker) {
  return nodes.flatMap((node) => {
    if (ts.isExpression(node) && isZodIdFormatType(checker.getTypeAtLocation(node))) return [node];
    if (ts.isIdentifier(node) && isZodIdFormat(node, checker)) return [node];
    return [];
  });
}

function zodPackageDirectories(root) {
  return new Set(
    SCANNED_PACKAGES.map((scanned) =>
      realpathSync(
        dirname(createRequire(join(root, scanned, "package.json")).resolve("zod/package.json")),
      ),
    ),
  );
}

function declaredIdFormatNames(directory) {
  return globSync("**/*.d.{ts,mts,cts}", { cwd: directory }).flatMap((file) => {
    const declarations = ts.createSourceFile(
      file,
      readFileSync(join(directory, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    return descendants(declarations)
      .filter(
        (node) =>
          ts.isIdentifier(node) &&
          ZOD_ID_FORMAT_NAME.test(node.text) &&
          ts.getNameOfDeclaration(node.parent) === node,
      )
      .map((node) => node.text);
  });
}

const reservedNamesByRoot = new Map();

function reservedNamesOf(root) {
  if (!reservedNamesByRoot.has(root)) {
    const directories = [...zodPackageDirectories(root)];
    reservedNamesByRoot.set(root, new Set(directories.flatMap(declaredIdFormatNames)));
  }
  return reservedNamesByRoot.get(root);
}

function isMemberOrKeyName(node) {
  const parent = node.parent;
  if (isMemberName(node)) return true;
  if (ts.isBindingElement(parent)) {
    return (
      ts.isObjectBindingPattern(parent.parent) && (parent.propertyName ?? parent.name) === node
    );
  }
  return (
    (ts.isPropertyAssignment(parent) ||
      ts.isShorthandPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === node
  );
}

function literalNamesOf(node, checker) {
  if (ts.isTypeNode(node)) return literalNamesOfType(checker.getTypeFromTypeNode(node), checker);
  if (ts.isExpression(node)) return literalNamesOfType(checker.getTypeAtLocation(node), checker);
  return [];
}

function reservedNamesIn(nodes, constants, checker, reserved) {
  const evaluate = evaluatorOf(constants);
  const isReservedText = (node) => {
    const value = evaluate(node);
    return (
      value.kind === "text" &&
      value.pieces.every((piece) => piece !== UNKNOWN_TEXT) &&
      reserved.has(value.pieces.join(""))
    );
  };
  return nodes.filter(
    (node) =>
      (ts.isIdentifier(node) && reserved.has(node.text) && isMemberOrKeyName(node)) ||
      ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        reserved.has(node.text)) ||
      (isStringExpression(node) && !isInsideStringExpression(node) && isReservedText(node)) ||
      literalNamesOf(node, checker).some((name) => reserved.has(name)),
  );
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
  const reserved = reservedNamesOf(root);
  return Object.keys(sources).flatMap((path) => {
    const sourceFile = program.getSourceFile(join(root, path));
    const nodes = descendants(sourceFile);
    const constants = constantInitializers(nodes);
    const copies = [
      ...patternsIn(nodes, constants)
        .filter(({ pattern, flagSets }) => flagSets.some((flags) => holdsTheShape(pattern, flags)))
        .map(({ node }) => node),
      ...zodIdFormatsIn(nodes, checker),
      ...reservedNamesIn(nodes, constants, checker, reserved),
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
