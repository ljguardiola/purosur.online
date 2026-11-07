import { execFileSync } from "node:child_process";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { parsedConfigOf } from "./typescript-config.mjs";

export const KEY_LOOKUP_PROGRAMS = [
  "tsconfig.json",
  "apps/backoffice/tsconfig.json",
  "apps/pos/tsconfig.json",
  "apps/cloud/tsconfig.json",
];

const IN = "tests a key from outside the code with `in`";
const CAST = "casts a key to `keyof`";
const INDEX = "indexes a table with a string index by a key from outside the code";

const SOURCE_FILE = /\.[cm]?tsx?$/;
const DECLARATION_FILE = /\.d\.[cm]?tsx?$/;
const TEST_FILE = /\.(test|visual)\.[cm]?tsx?$/;
const TEST_FOLDERS = new Set(["test-support", "test", "e2e"]);

export function isCheckedFile(path) {
  const segments = path.split("/");
  return (
    (segments[0] === "apps" || segments[0] === "packages") &&
    SOURCE_FILE.test(path) &&
    !DECLARATION_FILE.test(path) &&
    !TEST_FILE.test(path) &&
    !segments.slice(0, -1).some((segment) => TEST_FOLDERS.has(segment))
  );
}

function listTrackedFiles(cwd) {
  return execFileSync("git", ["ls-files", "apps", "packages"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter((path) => path !== "");
}

function unwrapped(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function textOf(node) {
  return unwrapped(node).getText().replace(/\s+/g, "");
}

function checkerTools(checker) {
  const isOwnKeyType = (type, seen = new Set()) => {
    if (seen.has(type)) return false;
    seen.add(type);
    if (type.flags & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type);
      return constraint !== undefined && isOwnKeyType(constraint, seen);
    }
    if (type.isUnion()) return type.types.every((member) => isOwnKeyType(member, seen));
    return (
      (type.flags &
        (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLike | ts.TypeFlags.ESSymbolLike)) !==
      0
    );
  };

  const hasStringIndex = (type) => {
    const apparent = checker.getApparentType(checker.getNonNullableType(type));
    const members = apparent.isUnion() ? apparent.types : [apparent];
    return members.some(
      (member) =>
        (member.flags & ts.TypeFlags.Object && member.objectFlags & ts.ObjectFlags.Mapped) ||
        checker
          .getIndexInfosOfType(member)
          .some(
            (info) =>
              (info.keyType.flags & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral)) !== 0,
          ),
    );
  };

  const isKeyofType = (node, seen = new Set()) => {
    if (ts.isParenthesizedTypeNode(node)) return isKeyofType(node.type, seen);
    if (ts.isTypeOperatorNode(node)) return node.operator === ts.SyntaxKind.KeyOfKeyword;
    if (ts.isUnionTypeNode(node)) return node.types.some((member) => isKeyofType(member, seen));
    if (!ts.isTypeReferenceNode(node)) return false;
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol === undefined || seen.has(symbol)) return false;
    seen.add(symbol);
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return (symbol.declarations ?? []).some(
      (declaration) =>
        ts.isTypeAliasDeclaration(declaration) && isKeyofType(declaration.type, seen),
    );
  };

  return { isOwnKeyType, hasStringIndex, isKeyofType };
}

function isHasOwnCall(node, table, key) {
  const call = unwrapped(node);
  if (!ts.isCallExpression(call) || call.arguments.length !== 2) return false;
  const callee = call.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "Object" &&
    callee.name.text === "hasOwn" &&
    textOf(call.arguments[0]) === table &&
    textOf(call.arguments[1]) === key
  );
}

function asserts(condition, table, key) {
  const node = unwrapped(condition);
  if (isHasOwnCall(node, table, key)) return true;
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
    (asserts(node.left, table, key) || asserts(node.right, table, key))
  );
}

function denies(condition, table, key) {
  const node = unwrapped(condition);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    return asserts(node.operand, table, key);
  }
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
    (denies(node.left, table, key) || denies(node.right, table, key))
  );
}

function alwaysExits(statement) {
  if (ts.isBlock(statement)) {
    const last = statement.statements.at(-1);
    return last !== undefined && alwaysExits(last);
  }
  return (
    ts.isReturnStatement(statement) ||
    ts.isThrowStatement(statement) ||
    ts.isContinueStatement(statement) ||
    ts.isBreakStatement(statement)
  );
}

function isGuardedByHasOwn(node, tableNode, keyNode) {
  const table = textOf(tableNode);
  const key = textOf(keyNode);
  let child = node;
  for (let parent = node.parent; parent !== undefined; child = parent, parent = parent.parent) {
    if (ts.isConditionalExpression(parent)) {
      if (child === parent.whenTrue && asserts(parent.condition, table, key)) return true;
      if (child === parent.whenFalse && denies(parent.condition, table, key)) return true;
    } else if (ts.isBinaryExpression(parent) && child === parent.right) {
      const operator = parent.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken && asserts(parent.left, table, key)) {
        return true;
      }
      if (operator === ts.SyntaxKind.BarBarToken && denies(parent.left, table, key)) return true;
    } else if (ts.isIfStatement(parent)) {
      if (child === parent.thenStatement && asserts(parent.expression, table, key)) return true;
      if (child === parent.elseStatement && denies(parent.expression, table, key)) return true;
    } else if (ts.isBlock(parent) || ts.isSourceFile(parent) || ts.isCaseClause(parent)) {
      const earlier = parent.statements.slice(0, parent.statements.indexOf(child));
      if (
        earlier.some(
          (statement) =>
            ts.isIfStatement(statement) &&
            statement.elseStatement === undefined &&
            denies(statement.expression, table, key) &&
            alwaysExits(statement.thenStatement),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function lookupsOf(sourceFile, checker, tools) {
  const found = [];
  const report = (node, form) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    found.push({ line, form });
  };
  const isOwnKey = (keyNode) => tools.isOwnKeyType(checker.getTypeAtLocation(keyNode));

  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
      !ts.isPrivateIdentifier(node.left) &&
      !isOwnKey(node.left)
    ) {
      report(node, IN);
    } else if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      tools.isKeyofType(node.type)
    ) {
      report(node, CAST);
    } else if (
      ts.isElementAccessExpression(node) &&
      !isOwnKey(node.argumentExpression) &&
      tools.hasStringIndex(checker.getTypeAtLocation(node.expression)) &&
      !isGuardedByHasOwn(node, node.expression, node.argumentExpression)
    ) {
      report(node, INDEX);
    } else if (
      ts.isBindingElement(node) &&
      node.propertyName !== undefined &&
      ts.isComputedPropertyName(node.propertyName) &&
      ts.isObjectBindingPattern(node.parent) &&
      !isOwnKey(node.propertyName.expression) &&
      tools.hasStringIndex(checker.getTypeAtLocation(node.parent))
    ) {
      report(node, INDEX);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function findInheritedKeyLookups(
  cwd,
  { tsconfigs = KEY_LOOKUP_PROGRAMS, trackedFiles = listTrackedFiles(cwd) } = {},
) {
  const root = resolve(cwd);
  const pathOf = (fileName) => relative(root, fileName).split(sep).join("/");
  const configs = tsconfigs.map((tsconfig) => parsedConfigOf(join(root, tsconfig)));
  const included = new Set(configs.flatMap((config) => config.fileNames.map(pathOf)));
  const uncovered = trackedFiles
    .filter((path) => isCheckedFile(path) && !included.has(path))
    .map((path) => join(root, path));

  const checked = new Set();
  const lookups = [];
  configs.forEach((config, index) => {
    const rootNames = index === 0 ? [...config.fileNames, ...uncovered] : config.fileNames;
    const program = ts.createProgram(rootNames, config.options);
    const checker = program.getTypeChecker();
    const tools = checkerTools(checker);
    for (const sourceFile of program.getSourceFiles()) {
      const path = pathOf(sourceFile.fileName);
      if (path.startsWith("..") || !isCheckedFile(path) || checked.has(path)) continue;
      checked.add(path);
      for (const { line, form } of lookupsOf(sourceFile, checker, tools)) {
        lookups.push({ path, line, form });
      }
    }
  });

  return lookups
    .sort((a, b) => a.path.localeCompare(b.path, "en") || a.line - b.line)
    .map(({ path, line, form }) => `${path}:${line}: ${form}`);
}
