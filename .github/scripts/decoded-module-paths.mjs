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

function isModuleUrl(expression) {
  const inner = unwrapped(expression);
  return (
    ts.isPropertyAccessExpression(inner) &&
    inner.name.text === "url" &&
    ts.isMetaProperty(inner.expression) &&
    inner.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

function isUrlOfModule(expression, aliases) {
  const inner = unwrapped(expression);
  if (ts.isIdentifier(inner)) return aliases.has(inner.text);
  return (
    ts.isNewExpression(inner) &&
    ts.isIdentifier(inner.expression) &&
    inner.expression.text === "URL" &&
    (inner.arguments ?? []).some(isModuleUrl)
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

function moduleUrlAliases(sourceFile) {
  const declarations = descendants(sourceFile).filter(
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined,
  );
  const aliases = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declarations) {
      const name = declaration.name.text;
      if (aliases.has(name) || !isUrlOfModule(declaration.initializer, aliases)) continue;
      aliases.add(name);
      grew = true;
    }
  }
  return aliases;
}

function readsPathname(node, aliases) {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return memberName(node) === "pathname" && isUrlOfModule(node.expression, aliases);
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer !== undefined &&
    isUrlOfModule(node.initializer, aliases)
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
  const aliases = moduleUrlAliases(sourceFile);
  const lineStarts = sourceFile.getLineStarts();
  return descendants(sourceFile)
    .filter((node) => readsPathname(node, aliases))
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
