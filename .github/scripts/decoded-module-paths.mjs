import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".cjs"];

function scriptKind(fileName) {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".ts") || fileName.endsWith(".mts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
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

function unwrapped(expression) {
  let inner = expression;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isNonNullExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner)
  ) {
    inner = inner.expression;
  }
  return inner;
}

function checkerOf(sourceFile) {
  const host = {
    getSourceFile: () => sourceFile,
    writeFile: () => {},
    getDefaultLibFileName: () => "lib.d.ts",
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => "",
    getNewLine: () => "\n",
    fileExists: (fileName) => fileName === sourceFile.fileName,
    readFile: () => undefined,
  };
  const options = { noLib: true, noResolve: true, allowJs: true, types: [] };
  return ts.createProgram([sourceFile.fileName], options, host).getTypeChecker();
}

function initializerOf(identifier, checker) {
  const declaration = checker.getSymbolAtLocation(identifier)?.valueDeclaration;
  if (
    declaration === undefined ||
    !ts.isVariableDeclaration(declaration) ||
    !ts.isIdentifier(declaration.name) ||
    declaration.initializer === undefined
  ) {
    return undefined;
  }
  return declaration.initializer;
}

function isModuleUrl(expression, checker, seen = new Set()) {
  const inner = unwrapped(expression);
  if (ts.isIdentifier(inner)) {
    const initializer = initializerOf(inner, checker);
    if (initializer === undefined || seen.has(initializer)) return false;
    return isModuleUrl(initializer, checker, new Set(seen).add(initializer));
  }
  return (
    ts.isPropertyAccessExpression(inner) &&
    inner.name.text === "url" &&
    ts.isMetaProperty(inner.expression) &&
    inner.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

function isUrlOfModule(expression, checker, seen = new Set()) {
  const inner = unwrapped(expression);
  if (ts.isIdentifier(inner)) {
    const initializer = initializerOf(inner, checker);
    if (initializer === undefined || seen.has(initializer)) return false;
    return isUrlOfModule(initializer, checker, new Set(seen).add(initializer));
  }
  return (
    ts.isNewExpression(inner) &&
    ts.isIdentifier(inner.expression) &&
    inner.expression.text === "URL" &&
    (inner.arguments ?? []).some(
      (argument) => isModuleUrl(argument, checker) || isUrlOfModule(argument, checker, seen),
    )
  );
}

function memberName(expression) {
  const inner = unwrapped(expression);
  if (ts.isPropertyAccessExpression(inner)) return inner.name.text;
  if (ts.isElementAccessExpression(inner) && ts.isStringLiteralLike(inner.argumentExpression)) {
    return inner.argumentExpression.text;
  }
  return undefined;
}

function readsPathname(node, checker) {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return memberName(node) === "pathname" && isUrlOfModule(node.expression, checker);
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer !== undefined &&
    isUrlOfModule(node.initializer, checker)
  ) {
    return node.name.elements.some((element) => {
      const property = element.propertyName ?? element.name;
      return (
        (ts.isIdentifier(property) || ts.isStringLiteralLike(property)) &&
        property.text === "pathname"
      );
    });
  }
  return false;
}

export function findUndecodedModulePaths(source, fileName) {
  if (!source.includes("import.meta.url") || !source.includes("pathname")) return [];
  const sourceFile = parse(source, fileName);
  const checker = checkerOf(sourceFile);
  const lineStarts = sourceFile.getLineStarts();
  return descendants(sourceFile)
    .filter((node) => readsPathname(node, checker))
    .map((node) => {
      const index = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const text = source.slice(lineStarts[index], lineStarts[index + 1] ?? source.length);
      return { line: index + 1, text: text.trim() };
    });
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findUndecodedModulePaths(readFile(path), path).map((match) => ({ path, ...match })),
  );
}

export function describeViolation({ path, line, text }) {
  return `${path}:${line}: ${text}`;
}

function defaultListTrackedFiles(cwd) {
  return execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter((path) => path !== "");
}

export function findScannedFiles(cwd = process.cwd(), listTrackedFiles = defaultListTrackedFiles) {
  return listTrackedFiles(cwd)
    .filter((path) => SCANNED_EXTENSIONS.some((extension) => path.endsWith(extension)))
    .sort();
}
