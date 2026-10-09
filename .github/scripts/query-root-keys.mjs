import { statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
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
const QUERY_READERS = [
  ...OPTIONS_BUILDERS,
  "useQuery",
  "useQueries",
  "useInfiniteQuery",
  "useSuspenseQuery",
  "useSuspenseQueries",
  "useSuspenseInfiniteQuery",
  "usePrefetchQuery",
  "usePrefetchInfiniteQuery",
  "fetchQuery",
  "fetchInfiniteQuery",
  "prefetchQuery",
  "prefetchInfiniteQuery",
  "ensureQueryData",
  "ensureInfiniteQueryData",
];
const QUERIES_FILE = /-queries\.[cm]?[jt]sx?$/;
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

  const queryKeyProperties = (type) =>
    (type?.getNonNullableType().getProperties() ?? [])
      .map((property) => property.getName())
      .filter((name) => declaresQueryKey(propertyDeclarationOf(type, name)));

  const parameterOf = (call, argument) => {
    const parameters = checker.getResolvedSignature(call)?.getDeclaration()?.parameters ?? [];
    return parameters[Math.min(call.arguments.indexOf(argument), parameters.length - 1)];
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
      return declaresQueryKey(parameterOf(parent, node));
    }
    return false;
  };

  const mayBeMissing = (property) => {
    const type = checker.getTypeOfSymbol(property);
    return type !== type.getNonNullableType();
  };

  const propertiesOfEach = (type, name) =>
    (type.isUnion() ? type.types : [type]).map((constituent) => constituent.getProperty(name));

  const lacksProperty = (node, name) => {
    const type = checker.getTypeAtLocation(node);
    return (
      !(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
      propertiesOfEach(type, name).every((property) => property === undefined)
    );
  };

  const writersOf = (members, name) => {
    const writers = [];
    for (const member of [...members].reverse()) {
      if (!ts.isSpreadAssignment(member) && !ts.isJsxSpreadAttribute(member)) {
        if (member.name?.getText() !== name) continue;
        writers.push(member);
        break;
      }
      const properties = propertiesOfEach(checker.getTypeAtLocation(member.expression), name);
      if (properties.every((property) => property === undefined)) continue;
      writers.push(member);
      if (properties.every((property) => property !== undefined && !mayBeMissing(property))) break;
    }
    return writers;
  };

  const queryKeyPropertiesAt = (node) => {
    const parent = node.parent;
    if (ts.isJsxSpreadAttribute(parent) || ts.isSpreadAssignment(parent)) {
      return queryKeyProperties(checker.getContextualType(parent.parent)).filter((name) =>
        writersOf(parent.parent.properties, name).includes(parent),
      );
    }
    if (
      ts.isCallExpression(parent) &&
      parent.arguments.includes(node) &&
      !ts.isObjectLiteralExpression(unwrapped(node))
    ) {
      const parameter = parameterOf(parent, node);
      return queryKeyProperties(parameter && checker.getTypeAtLocation(parameter.name));
    }
    return [];
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
    lacksProperty,
    writersOf,
    queryKeyPropertiesAt,
    isQueryKeyShorthand,
    queryKeyPropertiesOf: queryKeyProperties,
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
  const lifted =
    (ts.isPropertyAccessExpression(reference.parent) && reference.parent.name === reference) ||
    (ts.isQualifiedName(reference.parent) && reference.parent.right === reference);
  const node = lifted ? reference.parent : reference;
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
      const name = declaration.dotDotDotToken
        ? property
        : (declaration.propertyName ?? declaration.name).getText();
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
    if (property !== undefined && tools.lacksProperty(expression, property)) return [];
    if (ts.isArrayLiteralExpression(node)) {
      const first = node.elements[0];
      const outcomes =
        first === undefined
          ? [UNREADABLE]
          : ts.isStringLiteral(first)
            ? [{ kind: "root", literal: first }]
            : ts.isSpreadElement(first)
              ? trace(first.expression, seen)
              : [UNREADABLE];
      return outcomes.map((outcome) => ({ ...outcome, keys: [node, ...(outcome.keys ?? [])] }));
    }
    if (ts.isObjectLiteralExpression(node)) {
      return tools
        .writersOf(node.properties, property)
        .flatMap((writer) =>
          ts.isSpreadAssignment(writer)
            ? trace(writer.expression, seen, property)
            : traceDeclaration(writer, seen),
        );
    }
    if (ts.isIdentifier(node)) return traceDeclaration(declarationAt(node), seen, property);
    if (ts.isPropertyAccessExpression(node)) {
      const declaration = declarationAt(node.name);
      return declaration === undefined || ts.isPropertySignature(declaration)
        ? trace(node.expression, seen, node.name.text)
        : traceDeclaration(declaration, seen, property);
    }
    if (ts.isCallExpression(node)) return traceCall(node, seen, property);
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
        return trace(node.right, seen, property);
      }
      if (
        operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return [...trace(node.left, seen, property), ...trace(node.right, seen, property)];
      }
    }
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

function analysisOf({ tsconfig, sourceRoot, foldersOutsideConcepts }, cwd) {
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
  const forEachKeyUse = (report) => {
    for (const sourceFile of checkedFiles) {
      const visit = (node) => {
        if (tools.isQueryKeyShorthand(node)) report(node, trace(node.name));
        else if (ts.isExpression(node) && tools.isQueryKeyPosition(node)) {
          report(node, trace(node));
        }
        if (ts.isExpression(node)) {
          for (const property of tools.queryKeyPropertiesAt(node)) {
            report(node, trace(node, new Set(), property));
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  };
  return { checker, tools, root, checkedFiles, fromCwd, conceptFolderOf, forEachKeyUse };
}

export function findQueryRootKeyProblems(source, cwd = process.cwd()) {
  const { root, fromCwd, conceptFolderOf, forEachKeyUse } = analysisOf(source, cwd);
  const problems = new Set();
  for (const folder of source.foldersOutsideConcepts) {
    if (!statSync(join(root, folder), { throwIfNoEntry: false })?.isDirectory()) {
      problems.add(
        `${fromCwd(join(root, folder))} is listed as holding no concept, but there is no such folder`,
      );
    }
  }
  forEachKeyUse((position, outcomes) => {
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
  });
  return sorted(problems);
}

function sorted(problems) {
  return [...problems].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

function readerTools(checker, tools, checkedFiles) {
  const functionOf = (symbol, seen = new Set()) => {
    const declaration = tools.resolved(symbol)?.valueDeclaration;
    if (declaration === undefined || seen.has(declaration)) return undefined;
    if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
      return declaration;
    }
    if (!ts.isVariableDeclaration(declaration) && !ts.isPropertyAssignment(declaration)) {
      return undefined;
    }
    const initializer = declaration.initializer && unwrapped(declaration.initializer);
    if (initializer === undefined) return undefined;
    if (ts.isFunctionLike(initializer)) return initializer;
    const isConst =
      ts.isPropertyAssignment(declaration) ||
      (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
    const target = ts.isPropertyAccessExpression(initializer) ? initializer.name : initializer;
    return isConst && ts.isIdentifier(target)
      ? functionOf(checker.getSymbolAtLocation(target), new Set([...seen, declaration]))
      : undefined;
  };

  const calleeSymbol = (call) => {
    const callee = unwrapped(call.expression);
    const target = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    return tools.resolved(checker.getSymbolAtLocation(target));
  };

  const readers = new Set();
  const isReaderCall = (call) => {
    const symbol = calleeSymbol(call);
    if (tools.isTanstack(symbol, QUERY_READERS)) return true;
    const fn = functionOf(symbol);
    return fn !== undefined && readers.has(fn);
  };

  const takesQueryKey = (fn) =>
    fn.parameters.some(
      (parameter) =>
        tools.declaresQueryKey(parameter) ||
        tools.queryKeyPropertiesOf(checker.getTypeAtLocation(parameter.name)).length > 0,
    );
  const callsIn = (fn) => {
    const calls = [];
    const visit = (node) => {
      if (ts.isCallExpression(node)) calls.push(node);
      ts.forEachChild(node, visit);
    };
    if (fn.body !== undefined) visit(fn.body);
    return calls;
  };

  const candidates = [];
  for (const sourceFile of checkedFiles) {
    const visit = (node) => {
      if (ts.isFunctionLike(node) && takesQueryKey(node)) {
        candidates.push({ fn: node, calls: callsIn(node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const { fn, calls } of candidates) {
      if (!readers.has(fn) && calls.some(isReaderCall)) {
        readers.add(fn);
        grew = true;
      }
    }
  }

  const isInsideReader = (node) => {
    for (let current = node.parent; current !== undefined; current = current.parent) {
      if (readers.has(current)) return true;
    }
    return false;
  };

  return { isReaderCall, isInsideReader };
}

export function findQueriesFileProblems(source, cwd = process.cwd()) {
  const { checker, tools, root, checkedFiles, fromCwd, conceptFolderOf, forEachKeyUse } =
    analysisOf(source, cwd);
  const queriesFileOf = (folder) => join(root, folder, `${folder}-queries.ts`);
  const outsideQueriesFile = (fileName) => {
    const folder = conceptFolderOf(fileName);
    if (folder === undefined) return "outside a concept's queries file";
    return fileName === queriesFileOf(folder)
      ? undefined
      : `outside ${fromCwd(queriesFileOf(folder))}`;
  };

  const problems = new Set();
  for (const sourceFile of checkedFiles) {
    const folder = conceptFolderOf(sourceFile.fileName);
    if (
      folder !== undefined &&
      QUERIES_FILE.test(basename(sourceFile.fileName)) &&
      sourceFile.fileName !== queriesFileOf(folder)
    ) {
      problems.add(
        `${fromCwd(sourceFile.fileName)} is a queries file other than ${fromCwd(queriesFileOf(folder))}`,
      );
    }
  }

  forEachKeyUse((_position, outcomes) => {
    for (const key of outcomes.flatMap((outcome) => outcome.keys ?? [])) {
      const where = outsideQueriesFile(key.getSourceFile().fileName);
      if (where !== undefined) {
        problems.add(
          `${fromCwd(key.getSourceFile().fileName)}:${lineOf(key)} declares a query key ${where}`,
        );
      }
    }
  });

  const { isReaderCall, isInsideReader } = readerTools(checker, tools, checkedFiles);
  for (const sourceFile of checkedFiles) {
    if (conceptFolderOf(sourceFile.fileName) === undefined) continue;
    const where = outsideQueriesFile(sourceFile.fileName);
    if (where === undefined) continue;
    const visit = (node) => {
      if (ts.isCallExpression(node) && isReaderCall(node) && !isInsideReader(node)) {
        problems.add(`${fromCwd(sourceFile.fileName)}:${lineOf(node)} reads a query ${where}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return sorted(problems);
}
