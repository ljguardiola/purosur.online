import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";

const SCRIPTS_FOLDER = ".github/scripts";
const LISTING_SUBCOMMANDS = new Set(["diff", "log", "show"]);
const NAME_LISTINGS = new Set(["--name-only", "--name-status"]);
const NO_RENAMES = "--no-renames";
const END_OF_OPTIONS = "--";
const GLOBAL_OPTIONS_WITH_VALUE = new Set(["-C", "-c"]);
const UNKNOWN = "\0";

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

function withoutParentheses(node) {
  return ts.isParenthesizedExpression(node) ? withoutParentheses(node.expression) : node;
}

function enclosing(node) {
  let parent = node.parent;
  while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
  return parent;
}

function isConcatCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "concat"
  );
}

function isStringConcatenation(node) {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function isStringExpression(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    isStringConcatenation(node)
  );
}

function isConsumedIntoArray(node) {
  const parent = enclosing(node);
  if (parent === undefined) return false;
  if (ts.isSpreadElement(parent)) return ts.isArrayLiteralExpression(enclosing(parent));
  if (ts.isPropertyAccessExpression(parent) && withoutParentheses(parent.expression) === node) {
    return isConcatCall(enclosing(parent)) && enclosing(parent).expression === parent;
  }
  return isConcatCall(parent) && parent.arguments.some((arg) => withoutParentheses(arg) === node);
}

function isConsumedIntoString(node) {
  const parent = enclosing(node);
  return parent !== undefined && (isStringConcatenation(parent) || ts.isTemplateSpan(parent));
}

function isBlockScope(node) {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isFunctionLike(node)
  );
}

function isFunctionScope(node) {
  return ts.isSourceFile(node) || ts.isFunctionLike(node);
}

function nearest(node, isScope) {
  let ancestor = node.parent;
  while (!isScope(ancestor)) ancestor = ancestor.parent;
  return ancestor;
}

function boundNames(name) {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : boundNames(element.name),
  );
}

function variableScope(declaration) {
  const list = declaration.parent;
  if (!ts.isVariableDeclarationList(list)) return list;
  const isBlockScoped = (list.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)) !== 0;
  return nearest(list, isBlockScoped ? isBlockScope : isFunctionScope);
}

function declarationsOf(node) {
  if (ts.isVariableDeclaration(node)) {
    return boundNames(node.name).map((name) => ({ name, scope: variableScope(node) }));
  }
  if (ts.isParameter(node)) {
    return boundNames(node.name).map((name) => ({ name, scope: node.parent }));
  }
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
    return [{ name: node.name, scope: nearest(node, isBlockScope) }];
  }
  if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) {
    return [{ name: node.name, scope: node }];
  }
  if (
    (ts.isImportClause(node) || ts.isNamespaceImport(node) || ts.isImportSpecifier(node)) &&
    node.name
  ) {
    return [{ name: node.name, scope: node.getSourceFile() }];
  }
  return [];
}

function isReference(identifier) {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent)) return parent.name !== identifier;
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent)
  ) {
    return parent.name !== identifier;
  }
  if (ts.isBindingElement(parent)) return parent.propertyName !== identifier;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) {
    return false;
  }
  if (ts.isExportSpecifier(parent)) {
    return (
      parent.parent.parent.moduleSpecifier === undefined &&
      (parent.propertyName ?? parent.name) === identifier
    );
  }
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return false;
  return true;
}

function isExported(statement) {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isRelative(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function createModules(readModule) {
  const modules = new Map();
  const scopes = new Map();
  const declarationNames = new Set();

  const declare = ({ name, scope }, declaration) => {
    declarationNames.add(name);
    const names = scopes.get(scope) ?? new Map();
    names.set(name.text, declaration);
    scopes.set(scope, names);
  };

  const load = (path, source = readModule(path)) => {
    if (modules.has(path)) return modules.get(path);
    const sourceFile = parse(source, path);
    const nodes = descendants(sourceFile);
    for (const node of nodes) {
      for (const binding of declarationsOf(node)) declare(binding, node);
    }
    const module = { sourceFile, nodes };
    modules.set(path, module);
    return module;
  };

  const bindingOf = (identifier) => {
    if (declarationNames.has(identifier)) return undefined;
    for (let scope = identifier.parent; scope !== undefined; scope = scope.parent) {
      const declaration = scopes.get(scope)?.get(identifier.text);
      if (declaration !== undefined) return declaration;
    }
    return undefined;
  };

  const importedPath = (from, moduleSpecifier) => {
    if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) return undefined;
    if (!isRelative(moduleSpecifier.text)) return undefined;
    return posix.join(posix.dirname(from.fileName), moduleSpecifier.text);
  };

  const constantInitializer = (declaration) =>
    ts.isVariableDeclaration(declaration) &&
    ts.isIdentifier(declaration.name) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
      ? declaration.initializer
      : undefined;

  const exportedValue = (path, name, visiting = new Set()) => {
    const key = `${path}\0${name}`;
    if (path === undefined || visiting.has(key)) return undefined;
    const reached = new Set([...visiting, key]);
    const { sourceFile } = load(path);
    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement) && isExported(statement)) {
        const declaration = statement.declarationList.declarations.find(
          (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === name,
        );
        if (declaration !== undefined) return constantInitializer(declaration);
      }
      if (ts.isExportAssignment(statement) && !statement.isExportEquals && name === "default") {
        return statement.expression;
      }
      if (!ts.isExportDeclaration(statement)) continue;
      const from = importedPath(sourceFile, statement.moduleSpecifier);
      if (statement.exportClause === undefined) {
        const value = exportedValue(from, name, reached);
        if (value !== undefined) return value;
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;
      const specifier = statement.exportClause.elements.find(
        (element) => element.name.text === name,
      );
      if (specifier === undefined) continue;
      const local = specifier.propertyName ?? specifier.name;
      if (statement.moduleSpecifier !== undefined) return exportedValue(from, local.text, reached);
      return valueOfDeclaration(scopes.get(sourceFile)?.get(local.text), reached);
    }
    return undefined;
  };

  const importOf = (declaration) => {
    const importDeclaration = ts.isImportSpecifier(declaration)
      ? declaration.parent.parent.parent
      : ts.isNamespaceImport(declaration)
        ? declaration.parent.parent
        : declaration.parent;
    return importedPath(declaration.getSourceFile(), importDeclaration.moduleSpecifier);
  };

  const valueOfDeclaration = (declaration, visiting) => {
    if (declaration === undefined) return undefined;
    if (ts.isImportSpecifier(declaration)) {
      const imported = declaration.propertyName ?? declaration.name;
      return exportedValue(importOf(declaration), imported.text, visiting);
    }
    if (ts.isImportClause(declaration)) {
      return exportedValue(importOf(declaration), "default", visiting);
    }
    return constantInitializer(declaration);
  };

  const constantValueOf = (node) => {
    if (ts.isIdentifier(node)) return valueOfDeclaration(bindingOf(node));
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const namespace = bindingOf(node.expression);
      if (namespace === undefined || !ts.isNamespaceImport(namespace)) return undefined;
      return exportedValue(importOf(namespace), node.name.text);
    }
    return undefined;
  };

  const referencesOf = (module) => {
    const references = new Map();
    for (const node of module.nodes) {
      if (!ts.isIdentifier(node) || !isReference(node)) continue;
      const declaration = bindingOf(node);
      if (declaration === undefined) continue;
      references.set(declaration, [...(references.get(declaration) ?? []), node]);
    }
    return references;
  };

  return { load, constantValueOf, referencesOf };
}

function createResolver(constantValueOf) {
  const constantOf = (node, seen) => {
    const value = constantValueOf(node);
    return value === undefined || seen.has(value) ? undefined : value;
  };

  const resolveString = (expression, seen = new Set()) => {
    const node = withoutParentheses(expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      return node.templateSpans.reduce(
        (text, span) =>
          `${text}${resolveString(span.expression, seen) ?? UNKNOWN}${span.literal.text}`,
        node.head.text,
      );
    }
    if (isStringConcatenation(node)) {
      const left = resolveString(node.left, seen);
      const right = resolveString(node.right, seen);
      if (left === undefined && right === undefined) return undefined;
      return `${left ?? UNKNOWN}${right ?? UNKNOWN}`;
    }
    const constant = constantOf(node, seen);
    return constant === undefined
      ? undefined
      : resolveString(constant, new Set([...seen, constant]));
  };

  const resolveArray = (expression, seen = new Set()) => {
    const node = withoutParentheses(expression);
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.flatMap((element) =>
        ts.isSpreadElement(element)
          ? (resolveArray(element.expression, seen) ?? [UNKNOWN])
          : [resolveString(element, seen) ?? UNKNOWN],
      );
    }
    if (isConcatCall(node)) {
      const receiver = node.expression.expression;
      if (resolveString(receiver, seen) !== undefined) return undefined;
      return [
        ...(resolveArray(receiver, seen) ?? [UNKNOWN]),
        ...node.arguments.flatMap(
          (arg) => resolveArray(arg, seen) ?? [resolveString(arg, seen) ?? UNKNOWN],
        ),
      ];
    }
    const constant = constantOf(node, seen);
    return constant === undefined
      ? undefined
      : resolveArray(constant, new Set([...seen, constant]));
  };

  return { resolveArray, resolveString };
}

function commandArguments(command) {
  const words = command.trim().split(/\s+/);
  if (words[0] !== "git") return undefined;
  return words.slice(1).map((word) => word.replace(/^(["'])(.*)\1$/, "$2"));
}

function optionsOf(args) {
  const end = args.indexOf(END_OF_OPTIONS);
  return end === -1 ? args : args.slice(0, end);
}

function subcommandOf(options) {
  for (let index = 0; index < options.length; index++) {
    const arg = options[index];
    if (GLOBAL_OPTIONS_WITH_VALUE.has(arg)) index++;
    else if (!arg.includes(UNKNOWN) && !arg.startsWith("-")) return arg;
  }
  return undefined;
}

function listsNamesWithRenames(args) {
  const options = optionsOf(args);
  return (
    LISTING_SUBCOMMANDS.has(subcommandOf(options)) &&
    options.some((option) => NAME_LISTINGS.has(option)) &&
    !options.includes(NO_RENAMES)
  );
}

function isConstantConsumedOnlyBy(node, references, isConsumed) {
  const declaration = enclosing(node);
  if (
    declaration === undefined ||
    !ts.isVariableDeclaration(declaration) ||
    !ts.isIdentifier(declaration.name)
  ) {
    return false;
  }
  const uses = references.get(declaration) ?? [];
  return uses.length > 0 && uses.every(isConsumed);
}

function invokedArguments(node, references, { resolveArray, resolveString }) {
  if (ts.isArrayLiteralExpression(node) || isConcatCall(node)) {
    if (isConsumedIntoArray(node)) return undefined;
    if (isConstantConsumedOnlyBy(node, references, isConsumedIntoArray)) return undefined;
    return resolveArray(node);
  }
  if (isStringExpression(node)) {
    if (isConsumedIntoString(node)) return undefined;
    if (isConstantConsumedOnlyBy(node, references, isConsumedIntoString)) return undefined;
    const command = resolveString(node);
    return command === undefined ? undefined : commandArguments(command);
  }
  return undefined;
}

export function findNameListingsWithRenames(
  source,
  fileName,
  readModule = (path) => readFileSync(path, "utf8"),
) {
  const modules = createModules(readModule);
  const module = modules.load(fileName, source);
  const { sourceFile, nodes } = module;
  const resolver = createResolver(modules.constantValueOf);
  const references = modules.referencesOf(module);
  const lineStarts = sourceFile.getLineStarts();

  return nodes
    .filter((node) => {
      const args = invokedArguments(node, references, resolver);
      return args !== undefined && listsNamesWithRenames(args);
    })
    .map((node) => {
      const index = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const text = source.slice(lineStarts[index], lineStarts[index + 1] ?? source.length);
      return { line: index + 1, text: text.trim() };
    });
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findNameListingsWithRenames(readFile(path), path, readFile).map((match) => ({
      path,
      ...match,
    })),
  );
}

export function describeViolation({ path, line, text }) {
  return `${path}:${line}: ${text} lists changed names with git's rename detection; add ${NO_RENAMES}`;
}

function defaultListScripts(cwd) {
  return readdirSync(join(cwd, SCRIPTS_FOLDER));
}

export function findScannedFiles(cwd = process.cwd(), listScripts = defaultListScripts) {
  return listScripts(cwd)
    .filter((name) => !name.includes("/") && name.endsWith(".mjs") && !name.endsWith(".test.mjs"))
    .map((name) => posix.join(SCRIPTS_FOLDER, name))
    .sort();
}
