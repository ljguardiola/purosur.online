import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Vitest browser mode intermittently does not apply a test file's `vi.mock` factories: the real
// modules load instead, and every test in the file fails. Browser tests inject their dependencies
// through a component's `services` prop instead of mocking modules.
const MODULE_MOCK_METHODS = new Set(["mock", "doMock"]);

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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

function isModuleMockCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "vi" &&
    MODULE_MOCK_METHODS.has(node.expression.name.text)
  );
}

/** `vi.mock(...)`/`vi.doMock(...)` calls in a browser test file's source, at their 1-indexed start line. */
export function findViMockCalls(source) {
  const sourceFile = parse(source, "browser.test.tsx");
  const lines = source.split("\n");
  return descendants(sourceFile)
    .filter(isModuleMockCall)
    .map((call) => {
      const line = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line + 1;
      return { line, text: lines[line - 1].trim() };
    });
}

/** Scans the given file paths and returns one violation per module mock call found. */
export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findViMockCalls(readFile(path)).map((match) => ({ path, ...match })),
  );
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
  const include = browserProject && propertyNamed(browserProject, "include");
  if (!include || !ts.isArrayLiteralExpression(include)) {
    throw new Error("Vitest config has no browser project with an include array");
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
