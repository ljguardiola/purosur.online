import { globSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

// Vitest browser mode intermittently does not apply a test file's `vi.mock` factories: the real
// modules load instead, and every test in the file fails. Browser tests inject their dependencies
// through a component's `services` prop instead of mocking modules.
const MODULE_MOCK_METHODS = new Set(["mock", "doMock", "importMock"]);

// The script kind follows the file extension: `.ts` sources such as `<T>(x: T) => x` do not parse as TSX.
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

/** The local names bound to Vitest's `vi` and to namespace imports of "vitest". */
function vitestBindings(sourceFile) {
  const viNames = new Set(["vi"]);
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "vitest") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    } else if (bindings) {
      for (const specifier of bindings.elements) {
        if ((specifier.propertyName ?? specifier.name).text === "vi")
          viNames.add(specifier.name.text);
      }
    }
  }
  return { viNames, namespaces };
}

/** The member name of `object.name` or `object["name"]`. */
function accessedName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

function isVi(node, { viNames, namespaces }) {
  if (ts.isIdentifier(node)) return viNames.has(node.text);
  return (
    accessedName(node) === "vi" &&
    ts.isIdentifier(node.expression) &&
    namespaces.has(node.expression.text)
  );
}

function isModuleMockCall(node, bindings) {
  return (
    ts.isCallExpression(node) &&
    MODULE_MOCK_METHODS.has(accessedName(node.expression)) &&
    isVi(node.expression.expression, bindings)
  );
}

/** `vi.mock`, `vi.doMock` and `vi.importMock` calls in a module's source, at their 1-indexed start line. */
export function findViMockCalls(source, fileName = "browser.test.tsx") {
  const sourceFile = parse(source, fileName);
  const bindings = vitestBindings(sourceFile);
  const lineStarts = sourceFile.getLineStarts();
  return descendants(sourceFile)
    .filter((node) => isModuleMockCall(node, bindings))
    .map((call) => {
      const index = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line;
      const text = source.slice(lineStarts[index], lineStarts[index + 1] ?? source.length);
      return { line: index + 1, text: text.trim() };
    });
}

/** Scans the given file paths and returns one violation per module mock call found. */
export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findViMockCalls(readFile(path), path).map((match) => ({ path, ...match })),
  );
}

export function findImportSpecifiers(source) {
  return ts.preProcessFile(source, true, true).importedFiles.map((file) => file.fileName);
}

export function collectImportedModules(
  entries,
  { resolveImport, readFile = (path) => readFileSync(path, "utf8") },
) {
  const seen = new Set();
  const pending = [...entries];
  while (pending.length > 0) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    for (const specifier of findImportSpecifiers(readFile(path))) {
      const resolved = resolveImport(specifier, path);
      if (resolved !== undefined) pending.push(resolved);
    }
  }
  return [...seen].sort();
}

export function createImportResolver(cwd = process.cwd()) {
  const configPath = join(cwd, "tsconfig.json");
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, cwd, undefined, configPath);
  const cache = ts.createModuleResolutionCache(cwd, (name) => name, options);
  return (specifier, fromPath) => {
    const { resolvedModule } = ts.resolveModuleName(
      specifier,
      resolve(cwd, fromPath),
      options,
      ts.sys,
      cache,
    );
    if (!resolvedModule || resolvedModule.isExternalLibraryImport) return undefined;
    return relative(cwd, resolvedModule.resolvedFileName);
  };
}

function propertyNamed(objectLiteral, name) {
  return objectLiteral.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name,
  )?.initializer;
}

/** The `include` globs of the project named "browser" in a Vitest config's source. */
export function readBrowserTestGlobs(configSource) {
  const browserProject = descendants(parse(configSource, "vitest.config.ts")).find((node) => {
    if (!ts.isObjectLiteralExpression(node)) return false;
    const name = propertyNamed(node, "name");
    return name !== undefined && ts.isStringLiteral(name) && name.text === "browser";
  });
  if (!browserProject) throw new Error("Vitest config has no browser project");
  const include = propertyNamed(browserProject, "include");
  if (!include || !ts.isArrayLiteralExpression(include)) {
    throw new Error("Vitest config's browser project has no include array");
  }
  return include.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error("Vitest config's browser project include must list string literals");
    }
    return element.text;
  });
}

export function findBrowserTestFiles(cwd = process.cwd()) {
  const globs = readBrowserTestGlobs(readFileSync(join(cwd, "vitest.config.ts"), "utf8"));
  return globSync(globs, { cwd }).sort();
}

export function describeViolation({ path, line, text }) {
  return `${path}:${line}: ${text}`;
}
