import { statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

export const QUERY_KEY_SOURCES = [
  {
    tsconfig: "apps/backoffice/tsconfig.json",
    sourceRoot: "apps/backoffice/src",
    foldersOutsideConcepts: ["help", "platform", "shell"],
  },
  {
    tsconfig: "apps/pos/tsconfig.json",
    sourceRoot: "apps/pos/src/renderer",
    foldersOutsideConcepts: ["platform", "shell"],
  },
];

const TANSTACK = `${sep}@tanstack${sep}`;
const OPTIONS_BUILDERS = ["queryOptions", "infiniteQueryOptions"];
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

  const isTanstack = (symbol, names) =>
    names.includes(symbol?.getName()) &&
    (symbol.declarations ?? []).some((declaration) =>
      declaration.getSourceFile().fileName.split("/").join(sep).includes(TANSTACK),
    );

  const typeNodeNamesQueryKey = (typeNode, seen = new Set()) => {
    if (typeNode === undefined || seen.has(typeNode)) return false;
    seen.add(typeNode);
    if (ts.isUnionTypeNode(typeNode)) {
      return typeNode.types.some((member) => typeNodeNamesQueryKey(member, seen));
    }
    if (!ts.isTypeReferenceNode(typeNode)) return false;
    const symbol = resolved(checker.getSymbolAtLocation(typeNode.typeName));
    if (isTanstack(symbol, ["QueryKey"])) return true;
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
    if (ts.isParameter(parent) && parent.initializer === node) return declaresQueryKey(parent);
    if (ts.isBindingElement(parent) && parent.initializer === node) {
      return bindingElementDeclaresQueryKey(parent);
    }
    if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
      return declaresQueryKey(
        propertyDeclarationOf(
          checker.getContextualType(parent.parent.parent),
          parent.parent.name.getText(),
        ),
      );
    }
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
    isTanstack,
    declaresQueryKey,
    propertyDeclarationOf,
    isQueryKeyPosition,
    isQueryKeyShorthand,
  };
}

function referenceIndex(checker, tools, sourceFiles) {
  const references = new Map();
  for (const sourceFile of sourceFiles) {
    const visit = (node) => {
      if (ts.isIdentifier(node)) {
        const symbol =
          ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
            ? checker.getShorthandAssignmentValueSymbol(node.parent)
            : checker.getSymbolAtLocation(node);
        const declaration = tools.resolved(symbol)?.valueDeclaration;
        if (declaration !== undefined) {
          if (!references.has(declaration)) references.set(declaration, []);
          references.get(declaration).push(node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return references;
}

function isCallOrNaming(reference) {
  const node =
    ts.isPropertyAccessExpression(reference.parent) && reference.parent.name === reference
      ? reference.parent
      : reference;
  const parent = node.parent;
  return (
    (ts.isCallExpression(parent) && parent.expression === node) ||
    ((ts.isJsxOpeningLikeElement(parent) || ts.isJsxClosingElement(parent)) &&
      parent.tagName === node) ||
    ts.isImportOrExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isExportAssignment(parent) ||
    ts.isTypeQueryNode(parent)
  );
}

function rootTracer(checker, tools, references) {
  const UNREADABLE = { kind: "unreadable" };
  const PASSED_THROUGH = { kind: "passed-through" };

  const isOnlyCalled = (fn) => {
    const holder =
      ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)
        ? fn
        : ts.isVariableDeclaration(fn.parent) || ts.isPropertyAssignment(fn.parent)
          ? fn.parent
          : undefined;
    return (
      holder !== undefined &&
      (references.get(holder) ?? []).every(
        (reference) => reference === holder.name || isCallOrNaming(reference),
      )
    );
  };

  const fromParameter = (parameter, property) => {
    const declaration =
      property === undefined
        ? parameter
        : tools.propertyDeclarationOf(checker.getTypeAtLocation(parameter.name), property);
    return tools.declaresQueryKey(declaration) && isOnlyCalled(parameter.parent)
      ? [PASSED_THROUGH]
      : [UNREADABLE];
  };

  const traceDeclaration = (declaration, seen, property) => {
    if (declaration === undefined || seen.has(declaration)) return [UNREADABLE];
    const next = new Set([...seen, declaration]);
    if (ts.isVariableDeclaration(declaration)) {
      const isConst = (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
      if (!isConst || declaration.initializer === undefined) return [UNREADABLE];
      return trace(declaration.initializer, next, property);
    }
    if (ts.isPropertyAssignment(declaration)) {
      return trace(declaration.initializer, next, property);
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const value = checker.getShorthandAssignmentValueSymbol(declaration);
      return traceDeclaration(value?.valueDeclaration, next, property);
    }
    if (ts.isParameter(declaration)) return fromParameter(declaration, property);
    if (ts.isBindingElement(declaration)) {
      const name = (declaration.propertyName ?? declaration.name).getText();
      return traceDeclaration(declaration.parent.parent, next, name);
    }
    return [UNREADABLE];
  };

  const declarationAt = (node) =>
    tools.resolved(checker.getSymbolAtLocation(node))?.valueDeclaration;

  const traceCall = (call, seen, property) => {
    const callee = unwrapped(call.expression);
    const target = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    const symbol = tools.resolved(checker.getSymbolAtLocation(target));
    if (tools.isTanstack(symbol, OPTIONS_BUILDERS)) {
      return trace(call.arguments[0], seen, property);
    }
    let fn = symbol?.valueDeclaration;
    if (fn !== undefined && (ts.isVariableDeclaration(fn) || ts.isPropertyAssignment(fn))) {
      fn = fn.initializer && unwrapped(fn.initializer);
    }
    if (fn === undefined || seen.has(fn) || !ts.isFunctionLike(fn)) return [UNREADABLE];
    const returned = returnedExpressions(fn);
    if (returned === undefined || returned.length === 0) return [UNREADABLE];
    const next = new Set([...seen, fn]);
    return returned.flatMap((expression) =>
      expression === undefined ? [UNREADABLE] : trace(expression, next, property),
    );
  };

  const trace = (expression, seen = new Set(), property = undefined) => {
    const node = unwrapped(expression);
    if (ts.isArrayLiteralExpression(node)) {
      const first = node.elements[0];
      if (first === undefined) return [UNREADABLE];
      if (ts.isStringLiteral(first)) return [{ kind: "root", literal: first }];
      if (ts.isSpreadElement(first)) return trace(first.expression, seen);
      return [UNREADABLE];
    }
    if (ts.isObjectLiteralExpression(node)) {
      const member = node.properties.find((candidate) => candidate.name?.getText() === property);
      return traceDeclaration(member, seen);
    }
    if (ts.isIdentifier(node)) return traceDeclaration(declarationAt(node), seen, property);
    if (ts.isPropertyAccessExpression(node)) {
      const declaration = declarationAt(node.name);
      return declaration === undefined || ts.isPropertySignature(declaration)
        ? trace(node.expression, seen, node.name.text)
        : traceDeclaration(declaration, seen, property);
    }
    if (ts.isCallExpression(node)) return traceCall(node, seen, property);
    if (ts.isConditionalExpression(node)) {
      return [...trace(node.whenTrue, seen, property), ...trace(node.whenFalse, seen, property)];
    }
    return [UNREADABLE];
  };

  return trace;
}

function lineOf(node) {
  const sourceFile = node.getSourceFile();
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function findQueryRootKeyProblems(
  { tsconfig, sourceRoot, foldersOutsideConcepts },
  cwd = process.cwd(),
) {
  const program = programOf(join(cwd, tsconfig));
  const checker = program.getTypeChecker();
  const tools = checkerTools(checker);
  const root = join(cwd, sourceRoot);
  const checkedFiles = program
    .getSourceFiles()
    .filter(
      (sourceFile) =>
        !relative(root, sourceFile.fileName).startsWith("..") &&
        !TEST_FILE.test(sourceFile.fileName),
    );
  const trace = rootTracer(checker, tools, referenceIndex(checker, tools, checkedFiles));
  const fromCwd = (fileName) => relative(cwd, fileName).split(sep).join("/");
  const conceptFolderOf = (fileName) => {
    const path = relative(root, fileName);
    if (path.startsWith("..")) return undefined;
    const segments = path.split(sep);
    return segments.length > 1 && !foldersOutsideConcepts.includes(segments[0])
      ? segments[0]
      : undefined;
  };

  const problems = new Set();
  for (const folder of foldersOutsideConcepts) {
    if (!statSync(join(root, folder), { throwIfNoEntry: false })?.isDirectory()) {
      problems.add(
        `${fromCwd(join(root, folder))} is listed as holding no concept, but there is no such folder`,
      );
    }
  }
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

  for (const sourceFile of checkedFiles) {
    const visit = (node) => {
      if (tools.isQueryKeyShorthand(node)) report(node, trace(node.name));
      else if (ts.isExpression(node) && tools.isQueryKeyPosition(node)) report(node, trace(node));
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return [...problems].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}
