import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

// The script kind follows the file extension: `<unknown>value` parses as a cast only outside TSX.
function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
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

function isCast(node) {
  return ts.isAsExpression(node) || ts.isTypeAssertionExpression(node);
}

function castOperand(node) {
  let operand = node.expression;
  while (ts.isParenthesizedExpression(operand) || ts.isNonNullExpression(operand)) {
    operand = operand.expression;
  }
  return operand;
}

function isCastThroughUnknown(node) {
  if (!isCast(node)) return false;
  const operand = castOperand(node);
  return isCast(operand) && operand.type.kind === ts.SyntaxKind.UnknownKeyword;
}

export function findDoubleCasts(source, fileName) {
  if (!source.includes("unknown")) return [];
  const sourceFile = parse(source, fileName);
  const lineStarts = sourceFile.getLineStarts();
  return descendants(sourceFile)
    .filter(isCastThroughUnknown)
    .map((cast) => {
      const index = sourceFile.getLineAndCharacterOfPosition(cast.getStart(sourceFile)).line;
      const text = source.slice(lineStarts[index], lineStarts[index + 1] ?? source.length);
      return { line: index + 1, text: text.trim() };
    });
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findDoubleCasts(readFile(path), path).map((match) => ({ path, ...match })),
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
