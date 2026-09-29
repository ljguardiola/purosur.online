import { globSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const RELATIONAL_OPERATORS = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

const ELAPSED_MATCHER_NAMES = new Set([
  "toBeLessThan",
  "toBeLessThanOrEqual",
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeCloseTo",
]);

const CLOCK_READS = new Map([
  ["Date.now", "Date"],
  ["performance.now", "performance"],
  ["process.hrtime.bigint", "hrtime"],
]);

// The script kind follows the file extension: `.ts` sources with generic/assertion syntax do not
// parse as TSX, and a `.mjs`/`.js` source parses as plain JS.
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

function dottedName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const object = dottedName(node.expression);
    return object === undefined ? undefined : `${object}.${node.name.text}`;
  }
  return undefined;
}

function isFunctionValue(node) {
  return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function namedFunctions(sourceFile) {
  const functions = new Map();
  const add = (name, fn) => functions.set(name, [...(functions.get(name) ?? []), fn]);
  for (const node of descendants(sourceFile)) {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) add(node.name.text, node);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isFunctionValue(node.initializer)
    ) {
      add(node.name.text, node.initializer);
    }
  }
  return functions;
}

function ownNodes(root) {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
  };
  if (root) visit(root);
  return nodes;
}

function ownCode(scope) {
  return ownNodes(ts.isSourceFile(scope) ? scope : scope.body);
}

function directClockRead(node) {
  if (ts.isNewExpression(node)) {
    return dottedName(node.expression) === "Date" && !node.arguments?.length ? "Date" : undefined;
  }
  if (ts.isCallExpression(node)) return CLOCK_READS.get(dottedName(node.expression));
  return undefined;
}

function isPropertyAccessName(identifier) {
  return ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier;
}

function clockReadsIn(node, clockNames) {
  const clocks = new Set();
  const visit = (n) => {
    const direct = directClockRead(n);
    if (direct) clocks.add(direct);
    if (ts.isIdentifier(n) && !isPropertyAccessName(n)) {
      for (const clock of clockNames.get(n.text) ?? []) clocks.add(clock);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return clocks;
}

function clockDerivedNames(sourceFile) {
  const assignments = [];
  for (const node of descendants(sourceFile)) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      !isFunctionValue(node.initializer)
    ) {
      assignments.push({ name: node.name.text, expr: node.initializer });
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      assignments.push({ name: node.left.text, expr: node.right });
    }
  }

  const names = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, expr } of assignments) {
      const known = names.get(name) ?? new Set();
      const size = known.size;
      for (const clock of clockReadsIn(expr, names)) known.add(clock);
      if (known.size > size) {
        names.set(name, known);
        changed = true;
      }
    }
  }
  return names;
}

function matcherOperands(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return undefined;
  }
  if (!ELAPSED_MATCHER_NAMES.has(node.expression.name.text)) return undefined;
  let expectCall = node.expression.expression;
  if (ts.isPropertyAccessExpression(expectCall) && expectCall.name.text === "not") {
    expectCall = expectCall.expression;
  }
  if (!ts.isCallExpression(expectCall) || dottedName(expectCall.expression) !== "expect") {
    return undefined;
  }
  return { a: expectCall.arguments[0], b: node.arguments[0], needsBoth: false };
}

function elapsedOperands(node) {
  if (!ts.isBinaryExpression(node)) return matcherOperands(node);
  const operator = node.operatorToken.kind;
  if (operator === ts.SyntaxKind.MinusToken) {
    return { a: node.left, b: node.right, needsBoth: true };
  }
  if (RELATIONAL_OPERATORS.has(operator)) {
    return { a: node.left, b: node.right, needsBoth: false };
  }
  return undefined;
}

function isNestedIn(node, outer) {
  for (let current = node.parent; current; current = current.parent) {
    if (current === outer) return true;
  }
  return false;
}

function elapsedTimeViolations(sourceFile, clockNames, fakeTimers) {
  const reported = [];
  for (const node of descendants(sourceFile)) {
    const operands = elapsedOperands(node);
    if (!operands?.a || !operands.b) continue;
    const a = clockReadsIn(operands.a, clockNames);
    const b = clockReadsIn(operands.b, clockNames);
    const measuresClock = operands.needsBoth ? a.size > 0 && b.size > 0 : a.size > 0 || b.size > 0;
    if (!measuresClock) continue;
    if ([...a, ...b].every((clock) => fakeTimers.fakes(node, clock))) continue;
    reported.push(node);
  }
  return reported
    .filter((node) => !reported.some((outer) => outer !== node && isNestedIn(node, outer)))
    .map((node) => ({ node, reason: "measures real elapsed time" }));
}

// A `new Promise` executor runs synchronously, not deferred.
function isPromiseExecutor(fn) {
  const parent = fn.parent;
  return (
    !!parent &&
    ts.isNewExpression(parent) &&
    dottedName(parent.expression) === "Promise" &&
    parent.arguments?.[0] === fn
  );
}

function isLoopStatement(node) {
  return (
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}

function loopCanExit(loop) {
  const exitsFromBody = ownNodes(loop.statement).some(
    (n) => ts.isReturnStatement(n) || ts.isThrowStatement(n) || ts.isBreakStatement(n),
  );
  if (exitsFromBody) return true;
  return (
    (ts.isWhileStatement(loop) || ts.isDoStatement(loop)) &&
    ownNodes(loop.expression).some(ts.isAwaitExpression)
  );
}

function isInsidePollingLoop(call) {
  let child = call;
  for (let node = call.parent; node; child = node, node = node.parent) {
    if (ts.isFunctionLike(node)) {
      if (!isPromiseExecutor(node)) return false;
      continue;
    }
    if (isLoopStatement(node) && node.statement === child) return loopCanExit(node);
  }
  return false;
}

function isUseFakeTimersCall(node) {
  return ts.isCallExpression(node) && dottedName(node.expression) === "vi.useFakeTimers";
}

function installedTimersFake(call, api) {
  const [options] = call.arguments;
  const toFake =
    options && ts.isObjectLiteralExpression(options) ? propertyNamed(options, "toFake") : undefined;
  if (!toFake || !ts.isArrayLiteralExpression(toFake)) return true;
  return toFake.elements.some((element) => ts.isStringLiteralLike(element) && element.text === api);
}

function isHookCall(node) {
  return (
    ts.isCallExpression(node) &&
    ["beforeEach", "beforeAll"].includes(dottedName(node.expression) ?? "")
  );
}

function fakeTimersScope(functions) {
  const calledFunctions = (node) =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      ? (functions.get(node.expression.text) ?? [])
      : [];

  const installsDirectly = (nodes, api) =>
    nodes.some((n) => isUseFakeTimersCall(n) && installedTimersFake(n, api));

  const installsThroughCalls = (nodes, api) =>
    installsDirectly(nodes, api) ||
    nodes.some((n) => calledFunctions(n).some((fn) => installsDirectly(ownCode(fn), api)));

  const scopeFakes = (scope, api) => {
    const nodes = ownCode(scope);
    if (installsThroughCalls(nodes, api)) return true;
    return nodes.filter(isHookCall).some((hook) => {
      const [callback] = hook.arguments;
      return isFunctionValue(callback) && installsThroughCalls(ownCode(callback), api);
    });
  };

  return {
    fakes(node, api) {
      for (let scope = node.parent; scope; scope = scope.parent) {
        if (!ts.isSourceFile(scope) && !ts.isFunctionLike(scope)) continue;
        if (scopeFakes(scope, api)) return true;
      }
      return false;
    },
  };
}

function isZeroOrAbsentDelay(delay) {
  return !delay || (ts.isNumericLiteral(delay) && Number(delay.text) === 0);
}

function waitsFixedRealTime(call, fakeTimers) {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "waitForTimeout") return true;
  if (!ts.isIdentifier(callee) || !["setTimeout", "setInterval"].includes(callee.text)) {
    return false;
  }
  if (isZeroOrAbsentDelay(call.arguments[1])) return false;
  return !isInsidePollingLoop(call) && !fakeTimers.fakes(call, callee.text);
}

function waitsRealTimeViolations(sourceFile, fakeTimers) {
  return descendants(sourceFile)
    .filter(ts.isCallExpression)
    .filter((call) => waitsFixedRealTime(call, fakeTimers))
    .map((node) => ({ node, reason: "waits a fixed real time" }));
}

export function findRealTimeViolations(source, fileName) {
  const sourceFile = parse(source, fileName);
  const fakeTimers = fakeTimersScope(namedFunctions(sourceFile));
  const violations = [
    ...elapsedTimeViolations(sourceFile, clockDerivedNames(sourceFile), fakeTimers),
    ...waitsRealTimeViolations(sourceFile, fakeTimers),
  ];

  const lineStarts = sourceFile.getLineStarts();
  return violations
    .map(({ node, reason }) => {
      const index = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const text = source.slice(lineStarts[index], lineStarts[index + 1] ?? source.length);
      return { line: index + 1, text: text.trim(), reason };
    })
    .sort((a, b) => a.line - b.line);
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findRealTimeViolations(readFile(path), path).map((violation) => ({ path, ...violation })),
  );
}

export function describeViolation({ path, line, text, reason }) {
  return `${path}:${line}: ${text} (${reason})`;
}

function propertyNamed(objectLiteral, name) {
  return objectLiteral.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name,
  )?.initializer;
}

function pathStringOf(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (
    ts.isCallExpression(node) &&
    node.arguments.length > 0 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return undefined;
}

function pathArrayProperty(objectLiteral, name) {
  const property = propertyNamed(objectLiteral, name);
  if (!property) return [];
  if (!ts.isArrayLiteralExpression(property)) {
    throw new Error(`Vitest config project ${name} must list string literal paths`);
  }
  return property.elements.map((element) => {
    const path = pathStringOf(element);
    if (path === undefined) {
      throw new Error(`Vitest config project ${name} must list string literal paths`);
    }
    return path;
  });
}

export function readVitestProjects(configSource) {
  const sourceFile = parse(configSource, "vitest.config.ts");
  const rootTest = descendants(sourceFile)
    .map((node) => (ts.isObjectLiteralExpression(node) ? propertyNamed(node, "test") : undefined))
    .find(
      (test) =>
        test !== undefined && ts.isObjectLiteralExpression(test) && propertyNamed(test, "projects"),
    );
  if (!rootTest) throw new Error("Vitest config has no test.projects array");

  const projects = propertyNamed(rootTest, "projects");
  if (!projects || !ts.isArrayLiteralExpression(projects)) {
    throw new Error("Vitest config's test.projects is not an array");
  }

  return projects.elements.map((projectNode) => {
    if (!ts.isObjectLiteralExpression(projectNode)) {
      throw new Error("Vitest config's test.projects must list object literals");
    }
    const testConfig = propertyNamed(projectNode, "test");
    if (!testConfig || !ts.isObjectLiteralExpression(testConfig)) {
      throw new Error("Vitest config project has no test object");
    }
    const includeProp = propertyNamed(testConfig, "include");
    if (!includeProp || !ts.isArrayLiteralExpression(includeProp)) {
      throw new Error("Vitest config project has no include array");
    }
    const include = includeProp.elements.map((element) => {
      if (!ts.isStringLiteral(element)) {
        throw new Error("Vitest config project include must list string literals");
      }
      return element.text;
    });

    return {
      include,
      setupFiles: pathArrayProperty(testConfig, "setupFiles"),
      globalSetup: pathArrayProperty(testConfig, "globalSetup"),
    };
  });
}

export function readVerifyStaticTestGlobs(packageJsonSource) {
  const script = JSON.parse(packageJsonSource).scripts?.["verify:static"];
  if (!script) throw new Error("package.json has no verify:static script");
  const globs = script
    .match(/node --test\b([^&;|]*)/)?.[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!globs?.length) throw new Error("verify:static script has no `node --test` glob");
  return globs;
}

function stripLeadingDotSlash(path) {
  return path.replace(/^\.\//, "");
}

const TEST_ONLY_DIRECTORIES = new Set(["test", "test-support"]);

export function isTestOnlyHelperPath(relativePath) {
  return relativePath.split("/").some((segment) => TEST_ONLY_DIRECTORIES.has(segment));
}

export function findTestOnlyHelperFiles(cwd = process.cwd()) {
  const files = globSync(
    [
      "apps/*/src/**/*.ts",
      "apps/*/src/**/*.tsx",
      "packages/*/src/**/*.ts",
      "packages/*/src/**/*.tsx",
    ],
    {
      cwd,
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
  );
  return files.filter(isTestOnlyHelperPath).sort();
}

const STORY_GLOBS = ["apps/*/src/**/*.stories.tsx", "packages/*/src/**/*.stories.tsx"];

export function findScannedFiles(cwd = process.cwd()) {
  const projects = readVitestProjects(readFileSync(join(cwd, "vitest.config.ts"), "utf8"));
  const projectFiles = projects.flatMap((project) => [
    ...globSync(project.include, { cwd }),
    ...project.setupFiles.map(stripLeadingDotSlash),
    ...project.globalSetup.map(stripLeadingDotSlash),
  ]);

  const verifyStaticGlobs = readVerifyStaticTestGlobs(
    readFileSync(join(cwd, "package.json"), "utf8"),
  );
  const verifyStaticFiles = globSync(verifyStaticGlobs, { cwd });

  const storyFiles = globSync(STORY_GLOBS, { cwd, exclude: ["**/node_modules/**"] });

  const scanned = new Set([
    ...projectFiles,
    ...verifyStaticFiles,
    ...findTestOnlyHelperFiles(cwd),
    ...storyFiles,
  ]);
  // Vitest's screenshot folders are directories named after the test file they belong to.
  return [...scanned].filter((path) => statSync(join(cwd, path)).isFile()).sort();
}
