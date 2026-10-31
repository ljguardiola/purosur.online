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
  while (ts.isParenthesizedExpression(inner) || ts.isNonNullExpression(inner)) {
    inner = inner.expression;
  }
  return inner;
}

function memberName(expression) {
  const inner = unwrapped(expression);
  if (ts.isPropertyAccessExpression(inner)) return inner.name.text;
  if (ts.isElementAccessExpression(inner) && ts.isStringLiteralLike(inner.argumentExpression)) {
    return inner.argumentExpression.text;
  }
  return undefined;
}

function memberReceiver(expression) {
  const inner = unwrapped(expression);
  return ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)
    ? inner.expression
    : undefined;
}

function bindingName(declaration) {
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
    return declaration.name.text;
  }
  if (ts.isBindingElement(declaration) && ts.isIdentifier(declaration.name)) {
    return declaration.name.text;
  }
  return undefined;
}

function destructuredMember(declaration) {
  if (!ts.isBindingElement(declaration)) return undefined;
  const property = declaration.propertyName ?? declaration.name;
  return ts.isIdentifier(property) || ts.isStringLiteralLike(property) ? property.text : undefined;
}

function aliasesOf(sourceFile, member) {
  const declarations = descendants(sourceFile).filter(
    (node) => ts.isVariableDeclaration(node) || ts.isBindingElement(node),
  );
  const aliases = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declarations) {
      const name = bindingName(declaration);
      if (name === undefined || aliases.has(name)) continue;
      const initializer = ts.isVariableDeclaration(declaration)
        ? declaration.initializer
        : undefined;
      const bound =
        destructuredMember(declaration) === member ||
        (initializer !== undefined && refersTo(initializer, member, aliases));
      if (bound) {
        aliases.add(name);
        grew = true;
      }
    }
  }
  return aliases;
}

function refersTo(expression, member, aliases) {
  const inner = unwrapped(expression);
  return memberName(inner) === member || (ts.isIdentifier(inner) && aliases.has(inner.text));
}

function isMissingLocale(argument) {
  if (argument === undefined) return true;
  const inner = unwrapped(argument);
  return (
    (ts.isIdentifier(inner) && inner.text === "undefined") ||
    (ts.isVoidExpression(inner) && ts.isNumericLiteral(unwrapped(inner.expression)))
  );
}

function localeArgument(node, collators, localeCompares) {
  const callee = node.expression;
  if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
    if (refersTo(callee, "Collator", collators)) return { args: node.arguments ?? [], index: 0 };
  }
  if (!ts.isCallExpression(node)) return undefined;
  if (memberName(callee) === "localeCompare") return { args: node.arguments, index: 1 };
  if (memberName(callee) === "call") {
    const called = memberReceiver(callee);
    if (called !== undefined && refersTo(called, "localeCompare", localeCompares)) {
      return { args: node.arguments, index: 2 };
    }
  }
  return undefined;
}

export function findLocaleFreeComparisons(source, fileName) {
  if (!source.includes("localeCompare") && !source.includes("Collator")) return [];
  const sourceFile = parse(source, fileName);
  const collators = aliasesOf(sourceFile, "Collator");
  const localeCompares = aliasesOf(sourceFile, "localeCompare");
  const lineStarts = sourceFile.getLineStarts();
  return descendants(sourceFile)
    .filter((node) => {
      const call = localeArgument(node, collators, localeCompares);
      return call !== undefined && isMissingLocale(call.args[call.index]);
    })
    .map((node) => {
      const index = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const text = source.slice(lineStarts[index], lineStarts[index + 1] ?? source.length);
      return { line: index + 1, text: text.trim() };
    });
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findLocaleFreeComparisons(readFile(path), path).map((match) => ({ path, ...match })),
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
