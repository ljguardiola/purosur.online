import { statSync } from "node:fs";
import { dirname, join, matchesGlob, relative, resolve, sep } from "node:path";
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

const HANDED_ON_BY_NAME = {};

function callThrough(reference) {
  const parent = reference.parent;
  if (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isExportAssignment(parent)
  ) {
    return HANDED_ON_BY_NAME;
  }
  return ts.isCallExpression(parent) && parent.expression === reference ? parent : undefined;
}

function standaloneNameOf(fn) {
  if (ts.isFunctionDeclaration(fn)) return fn.name;
  return (ts.isArrowFunction(fn) || (ts.isFunctionExpression(fn) && fn.name === undefined)) &&
    ts.isVariableDeclaration(fn.parent)
    ? fn.parent.name
    : undefined;
}

function propertyNameText(name) {
  return ts.isIdentifier(name) ? name.text : undefined;
}

function propertyValue(property) {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return property;
}

function isTypePosition(reference) {
  for (let node = reference.parent; node !== undefined; node = node.parent) {
    if (ts.isExpressionWithTypeArguments(node)) return false;
    if (ts.isTypeNode(node)) return true;
  }
  return false;
}

function referenceAt(sourceFile, position) {
  let found;
  const visit = (node, inJsDoc) => {
    if (found !== undefined || position < node.pos || position >= node.end) return;
    if (ts.isIdentifier(node)) {
      if (node.getStart(sourceFile) === position) found = { node, inJsDoc };
      return;
    }
    for (const jsDoc of node.jsDoc ?? []) visit(jsDoc, true);
    ts.forEachChild(node, (child) => visit(child, inJsDoc));
  };
  visit(sourceFile, false);
  return found;
}

function exposesNoModuleObject(literal) {
  const parent = literal.parent;
  if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) return true;
  if (ts.isImportDeclaration(parent)) {
    const bindings = parent.importClause?.namedBindings;
    return bindings === undefined || ts.isNamedImports(bindings) || parent.importClause.isTypeOnly;
  }
  return (
    ts.isExportDeclaration(parent) &&
    (parent.isTypeOnly ||
      (parent.exportClause !== undefined && ts.isNamedExports(parent.exportClause)))
  );
}

const EVERY_MODULE = "every module";

function globPatternsOf(argument) {
  if (argument === undefined) return undefined;
  if (ts.isStringLiteralLike(argument)) return [argument.text];
  return ts.isArrayLiteralExpression(argument) && argument.elements.every(ts.isStringLiteralLike)
    ? argument.elements.map((element) => element.text)
    : undefined;
}

const GLOB_OPTIONS_KEEPING_ITS_FILES = new Set(["eager", "import", "query"]);

function keepsItsFiles(options) {
  return (
    options === undefined ||
    (ts.isObjectLiteralExpression(options) &&
      options.properties.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          GLOB_OPTIONS_KEEPING_ITS_FILES.has(propertyNameText(property.name)) &&
          (ts.isStringLiteralLike(property.initializer) ||
            property.initializer.kind === ts.SyntaxKind.TrueKeyword ||
            property.initializer.kind === ts.SyntaxKind.FalseKeyword),
      ))
  );
}

function modulesGlobbedBy(meta, programFiles) {
  if (meta.keywordToken !== ts.SyntaxKind.ImportKeyword) return [];
  const member = meta.parent;
  if (!ts.isPropertyAccessExpression(member)) return [EVERY_MODULE];
  if (member.name.text !== "glob") return [];
  const call = member.parent;
  if (!ts.isCallExpression(call) || call.expression !== member) return [EVERY_MODULE];
  const [argument, options] = call.arguments;
  const patterns = globPatternsOf(argument);
  if (
    patterns === undefined ||
    patterns.some((pattern) => !/^\.\.?\//.test(pattern)) ||
    !keepsItsFiles(options)
  ) {
    return [EVERY_MODULE];
  }
  const from = dirname(call.getSourceFile().fileName);
  return programFiles.filter((programFile) =>
    patterns.some((pattern) => matchesGlob(programFile.fileName, resolve(from, pattern))),
  );
}

function moduleReachTester(program, checker, resolved, checkedFiles) {
  let reached;
  const options = program.getCompilerOptions();
  const resolutionCache = ts.createModuleResolutionCache(
    program.getCurrentDirectory(),
    (fileName) => fileName,
    options,
  );
  const programFiles = program
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile);
  const moduleMentioned = (literal) => {
    const fileName = ts.resolveModuleName(
      literal.text,
      literal.getSourceFile().fileName,
      options,
      ts.sys,
      resolutionCache,
    ).resolvedModule?.resolvedFileName;
    return fileName === undefined ? undefined : program.getSourceFile(fileName);
  };
  const collect = () => {
    reached = new Set();
    const pending = [];
    const reach = (module) => {
      if (reached.has(module)) return;
      reached.add(module);
      pending.push(module);
    };
    const visit = (node) => {
      if (ts.isStringLiteralLike(node) && !exposesNoModuleObject(node)) {
        const module = moduleMentioned(node);
        if (module !== undefined) reach(module);
      }
      if (ts.isMetaProperty(node)) {
        for (const module of modulesGlobbedBy(node, programFiles)) reach(module);
      }
      ts.forEachChild(node, visit);
    };
    for (const checkedFile of checkedFiles) visit(checkedFile);
    while (pending.length > 0) {
      const module = pending.pop();
      const symbol = module === EVERY_MODULE ? undefined : checker.getSymbolAtLocation(module);
      for (const exported of symbol === undefined ? [] : checker.getExportsOfModule(symbol)) {
        for (const declaration of resolved(exported)?.declarations ?? []) {
          reach(declaration.getSourceFile());
        }
      }
    }
  };
  return (sourceFile) => {
    if (reached === undefined) collect();
    return reached.has(sourceFile) || reached.has(EVERY_MODULE);
  };
}

function rootTracer(service, checker, tools, checkedFiles, isModuleReachedAsObject) {
  const UNREADABLE = { kind: "unreadable" };
  const PASSED_THROUGH = { kind: "passed-through" };
  const checkedFileNamed = new Map(checkedFiles.map((file) => [file.fileName, file]));

  const callsOf = new Map();
  const checkedCallsOf = (fn) => {
    if (!callsOf.has(fn)) {
      const standaloneName = standaloneNameOf(fn);
      const name =
        standaloneName && !isModuleReachedAsObject(fn.getSourceFile()) ? standaloneName : undefined;
      const referenced =
        name && ts.isIdentifier(name)
          ? service.findReferences(name.getSourceFile().fileName, name.getStart())
          : undefined;
      const calls = [];
      const checked = referenced?.every(({ references }) =>
        references.every(({ fileName, textSpan }) => {
          const sourceFile = checkedFileNamed.get(fileName);
          if (sourceFile === undefined) return true;
          const found = referenceAt(sourceFile, textSpan.start);
          if (found === undefined) return false;
          const { node: reference, inJsDoc } = found;
          if (inJsDoc || reference === name || isTypePosition(reference)) return true;
          const call = callThrough(reference);
          if (call !== undefined && call !== HANDED_ON_BY_NAME) calls.push(call);
          return call !== undefined;
        }),
      );
      callsOf.set(fn, checked ? calls : undefined);
    }
    return callsOf.get(fn);
  };

  const fed = [];
  const fedNodes = new Set();
  const feed = (position, outcomes) => {
    if (fedNodes.has(position)) return;
    fedNodes.add(position);
    fed.push({ position, outcomes });
  };

  const feedFromProperties = (declaration, argument) => {
    const node = unwrapped(argument);
    if (!ts.isObjectLiteralExpression(node)) {
      feed(argument, [UNREADABLE]);
      return;
    }
    const name = propertyNameText(declaration.propertyName ?? declaration.name);
    for (const property of node.properties) {
      const propertyName =
        property.name === undefined ? undefined : propertyNameText(property.name);
      if (propertyName === undefined) feed(property, [UNREADABLE]);
      else if (propertyName === name) feed(propertyValue(property));
    }
  };

  const fedDeclarations = new Set();
  const feedArguments = (declaration, parameter, calls) => {
    if (fedDeclarations.has(declaration)) return;
    fedDeclarations.add(declaration);
    const index = parameter.parent.parameters
      .filter((each) => !(ts.isIdentifier(each.name) && each.name.text === "this"))
      .indexOf(parameter);
    for (const call of calls) {
      const passed = call.arguments;
      const spread = passed.slice(0, index + 1).find(ts.isSpreadElement);
      const argument = spread ?? passed[index];
      if (argument === undefined) continue;
      if (spread !== undefined || declaration === parameter) {
        feed(argument, parameter.dotDotDotToken ? [UNREADABLE] : undefined);
      } else {
        feedFromProperties(declaration, argument);
      }
    }
  };

  const passesThrough = (declaration, parameter) => {
    const calls = checkedCallsOf(parameter.parent);
    if (calls === undefined) return false;
    feedArguments(declaration, parameter, calls);
    return true;
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
      return tools.declaresQueryKey(declaration) && passesThrough(declaration, declaration)
        ? [PASSED_THROUGH]
        : [UNREADABLE];
    }
    if (ts.isBindingElement(declaration)) {
      const parameter = declaration.parent.parent;
      return ts.isParameter(parameter) &&
        tools.bindingElementDeclaresQueryKey(declaration) &&
        passesThrough(declaration, parameter)
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

  return { trace, fed };
}

const RUNTIME_LOADERS = new Set(["require", "createRequire"]);
const NODE_MODULE = new Set(["module", "node:module"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function isDynamicImport(node) {
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function runtimeLoaderTester(program, checker, resolved) {
  const isOwnDeclaration = (declaration) =>
    !(declaration.flags & ts.NodeFlags.Ambient) &&
    !program.isSourceFileFromExternalLibrary(declaration.getSourceFile());
  const symbolNamedBy = (identifier) => {
    const parent = identifier.parent;
    if (ts.isShorthandPropertyAssignment(parent)) {
      return checker.getShorthandAssignmentValueSymbol(parent);
    }
    if (ts.isBindingElement(parent) && parent.propertyName === undefined) {
      return checker.getTypeAtLocation(parent.parent).getProperty(identifier.text);
    }
    return resolved(checker.getSymbolAtLocation(identifier));
  };
  return (identifier) =>
    RUNTIME_LOADERS.has(identifier.text) &&
    !(symbolNamedBy(identifier)?.declarations ?? []).some(isOwnDeclaration);
}

function loadsAtRunTime(node, isRuntimeLoader) {
  const parent = node.parent;
  if (ts.isIdentifier(node)) return isRuntimeLoader(node);
  if (isDynamicImport(node)) {
    const [path] = node.arguments;
    return path === undefined || !ts.isStringLiteralLike(path);
  }
  if (!ts.isStringLiteralLike(node)) return false;
  if (ts.isElementAccessExpression(parent)) return RUNTIME_LOADERS.has(node.text);
  return (
    NODE_MODULE.has(node.text) &&
    (ts.isImportDeclaration(parent) ||
      ts.isExportDeclaration(parent) ||
      ts.isExternalModuleReference(parent) ||
      isDynamicImport(parent))
  );
}

function runtimeModuleLoadingIn(root, program, isRuntimeLoader) {
  const lines = [];
  for (const fileName of ts.sys.readDirectory(root, SOURCE_EXTENSIONS)) {
    const sourceFile =
      program.getSourceFile(fileName) ??
      ts.createSourceFile(fileName, ts.sys.readFile(fileName), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (loadsAtRunTime(node, isRuntimeLoader)) lines.push({ fileName, line: lineOf(node) });
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return lines;
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
  const { trace, fed } = rootTracer(
    service,
    checker,
    tools,
    checkedFiles,
    moduleReachTester(program, checker, tools.resolved, checkedFiles),
  );
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
  for (const { fileName, line } of runtimeModuleLoadingIn(
    root,
    program,
    runtimeLoaderTester(program, checker, tools.resolved),
  )) {
    problems.add(
      `${fromCwd(fileName)}:${line} loads a module at run time, which the query key check cannot follow`,
    );
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
  for (let index = 0; index < fed.length; index++) {
    const { position, outcomes } = fed[index];
    report(position, outcomes ?? trace(position));
  }
  return [...problems].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}
