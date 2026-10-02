import { statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
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

const TANSTACK_QUERY_CORE = `${sep}@tanstack${sep}query-core${sep}`;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

function languageServiceOf(tsconfigPath) {
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
  return ts.createLanguageService({
    getCompilationSettings: () => config.options,
    getProjectReferences: () => config.projectReferences,
    getScriptFileNames: () => config.fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (fileName) => {
      const text = ts.sys.readFile(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => dirname(tsconfigPath),
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  });
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
    if (ts.isParameter(parent) && parent.initializer === node) return declaresQueryKey(parent);
    if (ts.isBindingElement(parent) && parent.initializer === node) {
      return bindingElementDeclaresQueryKey(parent);
    }
    if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
      const name = parent.parent.name.getText();
      return (
        name === "queryKey" ||
        declaresQueryKey(
          propertyDeclarationOf(checker.getContextualType(parent.parent.parent), name),
        )
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
    if (ts.isCallOrNewExpression(parent) && parent.arguments?.includes(node)) {
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

function isCalledThrough(reference) {
  const parent = reference.parent;
  if (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isExportAssignment(parent)
  ) {
    return true;
  }
  const callee =
    (ts.isPropertyAccessExpression(parent) && parent.name === reference) ||
    (ts.isElementAccessExpression(parent) && parent.argumentExpression === reference)
      ? parent
      : reference;
  const user = callee.parent;
  if (ts.isCallOrNewExpression(user)) return user.expression === callee;
  return (
    (ts.isJsxOpeningElement(user) ||
      ts.isJsxSelfClosingElement(user) ||
      ts.isJsxClosingElement(user)) &&
    user.tagName === callee
  );
}

function nameOfFunction(fn) {
  if (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) return fn.name;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined;
  let holder = fn.parent;
  while (
    ts.isParenthesizedExpression(holder) ||
    ts.isAsExpression(holder) ||
    ts.isSatisfiesExpression(holder)
  ) {
    holder = holder.parent;
  }
  return ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)
    ? holder.name
    : undefined;
}

function isTypePosition(reference) {
  const parent = reference.parent;
  if (
    (ts.isMethodSignature(parent) || ts.isPropertySignature(parent)) &&
    parent.name === reference
  ) {
    return true;
  }
  for (let child = reference, node = parent; node !== undefined; child = node, node = node.parent) {
    if (ts.isExpressionWithTypeArguments(node)) {
      if (child !== node.expression) return true;
      const clause = node.parent;
      return (
        ts.isHeritageClause(clause) &&
        !(clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent))
      );
    }
    if (ts.isTypeNode(node)) return true;
  }
  return false;
}

function referenceAt(sourceFile, position) {
  let found;
  const visit = (node, inJsDoc) => {
    if (found !== undefined || position < node.pos || position >= node.end) return;
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
      const nameStart = node.getStart(sourceFile) + (ts.isIdentifier(node) ? 0 : 1);
      if (nameStart === position) found = { node, inJsDoc };
      return;
    }
    for (const jsDoc of node.jsDoc ?? []) visit(jsDoc, true);
    ts.forEachChild(node, (child) => visit(child, inJsDoc));
  };
  visit(sourceFile, false);
  return found;
}

function rootTracer(service, checker, tools, checkedFiles) {
  const UNREADABLE = { kind: "unreadable" };
  const PASSED_THROUGH = { kind: "passed-through" };
  const checkedFileNamed = new Map(checkedFiles.map((file) => [file.fileName, file]));

  const callersChecked = new Map();
  const callersAreChecked = (fn) => {
    if (!callersChecked.has(fn)) {
      const name = nameOfFunction(fn);
      const referenced =
        name && ts.isIdentifier(name)
          ? service.findReferences(name.getSourceFile().fileName, name.getStart())
          : undefined;
      callersChecked.set(
        fn,
        referenced?.every(({ references }) =>
          references.every(({ fileName, textSpan }) => {
            const sourceFile = checkedFileNamed.get(fileName);
            if (sourceFile === undefined) return true;
            const found = referenceAt(sourceFile, textSpan.start);
            if (found === undefined) return false;
            const { node: reference, inJsDoc } = found;
            return (
              inJsDoc ||
              reference === name ||
              isTypePosition(reference) ||
              isCalledThrough(reference)
            );
          }),
        ) ?? false,
      );
    }
    return callersChecked.get(fn);
  };

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
      return tools.declaresQueryKey(declaration) && callersAreChecked(declaration.parent)
        ? [PASSED_THROUGH]
        : [UNREADABLE];
    }
    if (ts.isBindingElement(declaration)) {
      const parameter = declaration.parent.parent;
      return ts.isParameter(parameter) &&
        tools.bindingElementDeclaresQueryKey(declaration) &&
        callersAreChecked(parameter.parent)
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

export function findQueryRootKeyProblems(
  { tsconfig, sourceRoot, foldersOutsideConcepts },
  cwd = process.cwd(),
) {
  const service = languageServiceOf(join(cwd, tsconfig));
  const program = service.getProgram();
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
  const trace = rootTracer(service, checker, tools, checkedFiles);
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
