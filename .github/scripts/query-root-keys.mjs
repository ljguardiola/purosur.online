import { join, relative, sep } from "node:path";
import ts from "typescript";

export const QUERY_KEY_SOURCES = [
  { tsconfig: "apps/backoffice/tsconfig.json", sourceRoot: "apps/backoffice/src" },
  { tsconfig: "apps/pos/tsconfig.json", sourceRoot: "apps/pos/src/renderer" },
];

const TANSTACK_QUERY_CORE = `${sep}@tanstack${sep}query-core${sep}`;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

function programOf(tsconfigPath) {
  const config = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  return ts.createProgram(config.fileNames, config.options);
}

function unwrapped(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function returnedExpressions(fn) {
  if (fn.body === undefined) return undefined;
  if (!ts.isBlock(fn.body)) return [fn.body];
  const returned = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) returned.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return returned;
}

function checkerTools(checker) {
  const resolved = (symbol) =>
    symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  const isTanstackQueryKey = (symbol) =>
    symbol?.getName() === "QueryKey" &&
    (symbol.declarations ?? []).some((declaration) =>
      declaration.getSourceFile().fileName.split("/").join(sep).includes(TANSTACK_QUERY_CORE),
    );

  const typeNodeNamesQueryKey = (typeNode, seen = new Set()) => {
    if (typeNode === undefined || seen.has(typeNode)) return false;
    seen.add(typeNode);
    if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
      return typeNode.types.some((member) => typeNodeNamesQueryKey(member, seen));
    }
    if (ts.isParenthesizedTypeNode(typeNode)) return typeNodeNamesQueryKey(typeNode.type, seen);
    if (!ts.isTypeReferenceNode(typeNode)) return false;
    const symbol = resolved(checker.getSymbolAtLocation(typeNode.typeName));
    if (isTanstackQueryKey(symbol)) return true;
    return (symbol?.declarations ?? []).some(
      (declaration) =>
        ts.isTypeParameterDeclaration(declaration) &&
        typeNodeNamesQueryKey(declaration.constraint, seen),
    );
  };

  const declaresQueryKey = (declaration) =>
    declaration !== undefined && typeNodeNamesQueryKey(declaration.type);

  const propertyDeclarationOf = (type, name) =>
    type?.getProperty(name)?.valueDeclaration ??
    type
      ?.getNonNullableType()
      .getProperty(name)
      ?.declarations?.find((declaration) => declaration.type !== undefined);

  const bindingElementDeclaresQueryKey = (element) => {
    const name = (element.propertyName ?? element.name).getText();
    return declaresQueryKey(propertyDeclarationOf(checker.getTypeAtLocation(element.parent), name));
  };

  const isQueryKeyPosition = (node) => {
    const parent = node.parent;
    if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
      return (
        parent.name.getText() === "queryKey" ||
        declaresQueryKey(
          propertyDeclarationOf(checker.getContextualType(parent.parent), parent.name.getText()),
        )
      );
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(node)) {
      const parameters = checker.getResolvedSignature(parent)?.getDeclaration()?.parameters ?? [];
      const index = parent.arguments.indexOf(node);
      return declaresQueryKey(parameters[Math.min(index, parameters.length - 1)]);
    }
    return false;
  };

  const isQueryKeyShorthand = (node) =>
    ts.isShorthandPropertyAssignment(node) &&
    (node.name.text === "queryKey" ||
      declaresQueryKey(
        propertyDeclarationOf(checker.getContextualType(node.parent), node.name.text),
      ));

  return {
    resolved,
    declaresQueryKey,
    bindingElementDeclaresQueryKey,
    isQueryKeyPosition,
    isQueryKeyShorthand,
  };
}

function rootTracer(checker, tools) {
  const UNREADABLE = { kind: "unreadable" };
  const PASSED_THROUGH = { kind: "passed-through" };

  const traceDeclaration = (declaration, seen) => {
    if (declaration === undefined || seen.has(declaration)) return [UNREADABLE];
    const next = new Set([...seen, declaration]);
    if (ts.isVariableDeclaration(declaration)) {
      const isConst = (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
      if (!isConst || declaration.initializer === undefined) return [UNREADABLE];
      return trace(declaration.initializer, next);
    }
    if (ts.isPropertyAssignment(declaration)) return trace(declaration.initializer, next);
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const value = checker.getShorthandAssignmentValueSymbol(declaration);
      return traceDeclaration(value?.valueDeclaration, next);
    }
    if (ts.isParameter(declaration)) {
      return tools.declaresQueryKey(declaration) ? [PASSED_THROUGH] : [UNREADABLE];
    }
    if (ts.isBindingElement(declaration)) {
      return ts.isParameter(declaration.parent.parent) &&
        tools.bindingElementDeclaresQueryKey(declaration)
        ? [PASSED_THROUGH]
        : [UNREADABLE];
    }
    return [UNREADABLE];
  };

  const declarationAt = (node) =>
    tools.resolved(checker.getSymbolAtLocation(node))?.valueDeclaration;

  const traceCall = (call, seen) => {
    const callee = unwrapped(call.expression);
    const target = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    let fn = declarationAt(target);
    if (fn !== undefined && (ts.isVariableDeclaration(fn) || ts.isPropertyAssignment(fn))) {
      fn = fn.initializer && unwrapped(fn.initializer);
    }
    if (fn === undefined || seen.has(fn) || !ts.isFunctionLike(fn)) return [UNREADABLE];
    const returned = returnedExpressions(fn);
    if (returned === undefined || returned.length === 0) return [UNREADABLE];
    const next = new Set([...seen, fn]);
    return returned.flatMap((expression) =>
      expression === undefined ? [UNREADABLE] : trace(expression, next),
    );
  };

  const trace = (expression, seen = new Set()) => {
    const node = unwrapped(expression);
    if (ts.isArrayLiteralExpression(node)) {
      const first = node.elements[0];
      if (first === undefined) return [UNREADABLE];
      if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
        return [{ kind: "root", literal: first }];
      }
      if (ts.isSpreadElement(first)) return trace(first.expression, seen);
      return [UNREADABLE];
    }
    if (ts.isIdentifier(node)) {
      if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
        return traceDeclaration(node.parent, seen);
      }
      return traceDeclaration(declarationAt(node), seen);
    }
    if (ts.isPropertyAccessExpression(node))
      return traceDeclaration(declarationAt(node.name), seen);
    if (ts.isCallExpression(node)) return traceCall(node, seen);
    if (ts.isConditionalExpression(node)) {
      return [...trace(node.whenTrue, seen), ...trace(node.whenFalse, seen)];
    }
    return [UNREADABLE];
  };

  return trace;
}

function lineOf(node) {
  const sourceFile = node.getSourceFile();
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function findQueryRootKeyProblems({ tsconfig, sourceRoot }, cwd = process.cwd()) {
  const program = programOf(join(cwd, tsconfig));
  const checker = program.getTypeChecker();
  const tools = checkerTools(checker);
  const trace = rootTracer(checker, tools);
  const root = join(cwd, sourceRoot);
  const fromCwd = (fileName) => relative(cwd, fileName).split(sep).join("/");
  const conceptFolderOf = (fileName) => {
    const path = relative(root, fileName);
    if (path.startsWith("..")) return undefined;
    const segments = path.split(sep);
    return segments.length > 1 ? segments[0] : undefined;
  };

  const problems = new Set();
  const report = (position, outcomes) => {
    for (const outcome of outcomes) {
      if (outcome.kind === "unreadable") {
        problems.add(
          `${fromCwd(position.getSourceFile().fileName)}:${lineOf(position)} uses a query key whose root the check cannot read`,
        );
      }
      if (outcome.kind !== "root") continue;
      const { literal } = outcome;
      const fileName = literal.getSourceFile().fileName;
      const folder = conceptFolderOf(fileName);
      if (literal.text === folder) continue;
      const where =
        folder === undefined
          ? "no concept folder holds it"
          : `the concept folder holding it is "${folder}"`;
      problems.add(
        `${fromCwd(fileName)}:${lineOf(literal)} roots a query key at "${literal.text}", but ${where}`,
      );
    }
  };

  for (const sourceFile of program.getSourceFiles()) {
    if (relative(root, sourceFile.fileName).startsWith("..")) continue;
    if (TEST_FILE.test(sourceFile.fileName)) continue;
    const visit = (node) => {
      if (tools.isQueryKeyShorthand(node)) report(node, trace(node.name));
      else if (ts.isExpression(node) && tools.isQueryKeyPosition(node)) report(node, trace(node));
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return [...problems].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}
