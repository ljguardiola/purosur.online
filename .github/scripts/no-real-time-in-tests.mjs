import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// A test whose result depends on how much real time actually passes while it runs is flaky by
// construction: it waits a fixed real time to let something happen instead of waiting for the
// thing itself, or it measures real elapsed time to decide pass/fail. Both are rejected in favor
// of fake timers, an injected clock, or waiting on the condition the test actually cares about.

const REJECTED_COMPARISON_OPERATORS = new Set([
  ts.SyntaxKind.MinusToken,
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

/** The member name of `object.name` or `object["name"]`. */
function accessedName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

/** `a.b.c` as a dotted string, for an expression built only of identifiers and property access. */
function dottedName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const object = dottedName(node.expression);
    return object === undefined ? undefined : `${object}.${node.name.text}`;
  }
  return undefined;
}

// --- Rule 1: measures real elapsed time -------------------------------------------------------

const DIRECT_CLOCK_READS = new Set([
  "Date.now",
  "performance.now",
  "process.hrtime.bigint",
  "process.hrtime",
  "process.uptime",
]);

function isDirectClockReadCall(node) {
  if (ts.isNewExpression(node)) {
    return dottedName(node.expression) === "Date" && (node.arguments?.length ?? 0) === 0;
  }
  if (!ts.isCallExpression(node)) return false;
  return DIRECT_CLOCK_READS.has(dottedName(node.expression));
}

function isHrtimeWithArgument(node) {
  return (
    ts.isCallExpression(node) &&
    dottedName(node.expression) === "process.hrtime" &&
    node.arguments.length > 0
  );
}

/** Whether `node`, or anything inside it, reads the real clock or references a clock-derived name. */
function containsClockRead(node, clockDerivedNames) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (
      isDirectClockReadCall(n) ||
      isHrtimeWithArgument(n) ||
      (ts.isIdentifier(n) && clockDerivedNames.has(n.text))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * Every name assigned, anywhere in the file, from an expression that contains a clock read or
 * another already clock-derived name, computed to a fixpoint.
 */
function computeClockDerivedNames(sourceFile) {
  const assignments = [];
  for (const node of descendants(sourceFile)) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      assignments.push({ name: node.name.text, expr: node.initializer });
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      assignments.push({ name: node.left.text, expr: node.right });
    }
  }

  const derived = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, expr } of assignments) {
      if (!derived.has(name) && containsClockRead(expr, derived)) {
        derived.add(name);
        changed = true;
      }
    }
  }
  return derived;
}

function expectMatcherCallOperands(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression))
    return undefined;
  if (!ELAPSED_MATCHER_NAMES.has(node.expression.name.text)) return undefined;
  const expectCall = node.expression.expression;
  if (!ts.isCallExpression(expectCall) || dottedName(expectCall.expression) !== "expect") {
    return undefined;
  }
  return { a: expectCall.arguments[0], b: node.arguments[0] };
}

function elapsedTimeViolations(sourceFile, clockDerivedNames) {
  const violations = [];
  for (const node of descendants(sourceFile)) {
    if (isHrtimeWithArgument(node)) {
      violations.push({ node, reason: "measures real elapsed time" });
      continue;
    }
    if (ts.isBinaryExpression(node) && REJECTED_COMPARISON_OPERATORS.has(node.operatorToken.kind)) {
      if (
        containsClockRead(node.left, clockDerivedNames) &&
        containsClockRead(node.right, clockDerivedNames)
      ) {
        violations.push({ node, reason: "measures real elapsed time" });
      }
      continue;
    }
    const operands = expectMatcherCallOperands(node);
    if (
      operands?.a &&
      operands.b &&
      containsClockRead(operands.a, clockDerivedNames) &&
      containsClockRead(operands.b, clockDerivedNames)
    ) {
      violations.push({ node, reason: "measures real elapsed time" });
    }
  }
  return violations;
}

// --- Rule 2: waits a fixed real time -----------------------------------------------------------

function globalTimerTarget(expr) {
  let node = expr;
  if (ts.isCallExpression(node) && accessedName(node.expression) === "bind") {
    node = node.expression.expression;
  }
  const name = dottedName(node);
  if (
    name === "setTimeout" ||
    name === "globalThis.setTimeout" ||
    name === "window.setTimeout" ||
    name === "self.setTimeout"
  ) {
    return "setTimeout";
  }
  if (
    name === "setInterval" ||
    name === "globalThis.setInterval" ||
    name === "window.setInterval" ||
    name === "self.setInterval"
  ) {
    return "setInterval";
  }
  return undefined;
}

/** Local names aliased (directly, or through `.bind(...)`) from the real `setTimeout`/`setInterval`. */
function globalTimerAliases(sourceFile) {
  const names = new Set(["setTimeout", "setInterval"]);
  for (const node of descendants(sourceFile)) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (globalTimerTarget(node.initializer)) names.add(node.name.text);
    }
  }
  return names;
}

/** Local names bound to `setTimeout` and `scheduler` imported from `node:timers/promises`. */
function timersPromisesBindings(sourceFile) {
  const setTimeoutNames = new Set();
  const schedulerNames = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (!["node:timers/promises", "timers/promises"].includes(statement.moduleSpecifier.text))
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const specifier of bindings.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text;
      if (imported === "setTimeout") setTimeoutNames.add(specifier.name.text);
      if (imported === "scheduler") schedulerNames.add(specifier.name.text);
    }
  }
  return { setTimeoutNames, schedulerNames };
}

/** `{ delayIndex }` when `node` is a real timer call, given the file's aliases and imports. */
function classifyTimerCall(node, aliases, promisesBindings) {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;

  if (ts.isIdentifier(callee) && aliases.has(callee.text)) return { delayIndex: 1 };
  if (!ts.isIdentifier(callee) && globalTimerTarget(callee)) return { delayIndex: 1 };

  if (ts.isIdentifier(callee) && promisesBindings.setTimeoutNames.has(callee.text)) {
    return { delayIndex: 0 };
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "wait" &&
    ts.isIdentifier(callee.expression) &&
    promisesBindings.schedulerNames.has(callee.expression.text)
  ) {
    return { delayIndex: 0 };
  }
  return undefined;
}

function isWaitForTimeoutCall(node) {
  return ts.isCallExpression(node) && accessedName(node.expression) === "waitForTimeout";
}

function isZeroOrAbsentDelay(delayArg) {
  if (!delayArg) return true;
  return ts.isNumericLiteral(delayArg) && Number(delayArg.text) === 0;
}

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

/** Whether `bodyNode`, without descending into a nested function, contains a return/break/throw. */
function bodyHasCheckedExit(bodyNode) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (n !== bodyNode && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) || ts.isBreakStatement(n) || ts.isThrowStatement(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(bodyNode);
  return found;
}

function containsCallOrAwait(expr) {
  if (!expr) return false;
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) || ts.isAwaitExpression(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return found;
}

function loopCanExitOnCheckedCondition(loop) {
  if (bodyHasCheckedExit(loop.statement)) return true;
  return (
    (ts.isWhileStatement(loop) || ts.isDoStatement(loop)) && containsCallOrAwait(loop.expression)
  );
}

/**
 * Whether `callNode` sits inside a loop that can end on a checked condition, crossing only
 * function expressions/arrows that are themselves the executor argument of `new Promise(...)`.
 */
function isInsidePollingLoop(callNode) {
  let child = callNode;
  let node = callNode.parent;
  while (node) {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (!isPromiseExecutor(node)) return false;
      child = node;
      node = node.parent;
      continue;
    }
    if (ts.isFunctionLike(node)) return false;
    if (isLoopStatement(node) && node.statement === child) {
      return loopCanExitOnCheckedCondition(node);
    }
    child = node;
    node = node.parent;
  }
  return false;
}

/** The `reject` parameter name of the nearest enclosing `new Promise((resolve, reject) => ...)`. */
function enclosingRejectParamName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      isPromiseExecutor(current)
    ) {
      const param = current.parameters[1];
      return param && ts.isIdentifier(param.name) ? param.name.text : undefined;
    }
  }
  return undefined;
}

/** Whether `callbackArg` can only reject or throw: a deadline that cannot itself pass the test. */
function isRejectOrThrowOnlyCallback(callNode, callbackArg) {
  if (!callbackArg) return false;
  const rejectName = enclosingRejectParamName(callNode);

  if (ts.isIdentifier(callbackArg)) return callbackArg.text === rejectName;
  if (!ts.isArrowFunction(callbackArg) && !ts.isFunctionExpression(callbackArg)) return false;

  const isRejectCall = (expr) =>
    !!rejectName && ts.isCallExpression(expr) && dottedName(expr.expression) === rejectName;

  const body = callbackArg.body;
  if (!ts.isBlock(body)) return isRejectCall(body);
  if (body.statements.length !== 1) return false;
  const [statement] = body.statements;
  if (ts.isThrowStatement(statement)) return true;
  return ts.isExpressionStatement(statement) && isRejectCall(statement.expression);
}

function isDescribeCallee(expr) {
  const name = dottedName(expr);
  return name === "describe" || !!name?.startsWith("describe.");
}

function nearestEnclosingDescribeCallback(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isCallExpression(current) &&
      isDescribeCallee(current.expression) &&
      current.arguments.length >= 2 &&
      (ts.isArrowFunction(current.arguments[1]) || ts.isFunctionExpression(current.arguments[1]))
    ) {
      return current.arguments[1];
    }
  }
  return undefined;
}

/** Whether `root`'s subtree, including inside nested functions, contains `vi.useFakeTimers(...)`. */
function containsUseFakeTimers(root) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && dottedName(n.expression) === "vi.useFakeTimers") {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(root);
  return found;
}

function fakeTimersInScope(callNode, sourceFile) {
  const scope = nearestEnclosingDescribeCallback(callNode) ?? sourceFile;
  return containsUseFakeTimers(scope);
}

function waitsRealTimeViolations(sourceFile) {
  const aliases = globalTimerAliases(sourceFile);
  const promisesBindings = timersPromisesBindings(sourceFile);
  const violations = [];

  for (const node of descendants(sourceFile)) {
    if (!ts.isCallExpression(node)) continue;

    if (isWaitForTimeoutCall(node)) {
      violations.push({ node, reason: "waits a fixed real time" });
      continue;
    }

    const timer = classifyTimerCall(node, aliases, promisesBindings);
    if (!timer) continue;

    const delayArg = node.arguments[timer.delayIndex];
    if (isZeroOrAbsentDelay(delayArg)) continue;
    if (isInsidePollingLoop(node)) continue;
    if (timer.delayIndex === 1 && isRejectOrThrowOnlyCallback(node, node.arguments[0])) continue;
    if (fakeTimersInScope(node, sourceFile)) continue;

    violations.push({ node, reason: "waits a fixed real time" });
  }
  return violations;
}

// --- Public API ---------------------------------------------------------------------------------

/** Violations in one source file's text, at their 1-indexed line and trimmed source text. */
export function findRealTimeViolations(source, fileName) {
  const sourceFile = parse(source, fileName);
  const clockDerivedNames = computeClockDerivedNames(sourceFile);
  const violations = [
    ...elapsedTimeViolations(sourceFile, clockDerivedNames),
    ...waitsRealTimeViolations(sourceFile),
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

/** Scans the given file paths and returns one violation per real-time dependency found. */
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

/** The string literal passed to a call such as `r("./path")`, or a bare string literal element. */
function pathStringOf(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isCallExpression(node) && ts.isStringLiteral(node.arguments[0]))
    return node.arguments[0].text;
  return undefined;
}

function pathArrayProperty(objectLiteral, name) {
  const property = propertyNamed(objectLiteral, name);
  if (!property || !ts.isArrayLiteralExpression(property)) return [];
  return property.elements.map(pathStringOf).filter((path) => path !== undefined);
}

/** Every Vitest project's `include` globs, `setupFiles` and `globalSetup` paths, from the config's source. */
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

/** The glob(s) passed to `node --test` in package.json's `verify:static` script. */
export function readVerifyStaticTestGlobs(packageJsonSource) {
  const script = JSON.parse(packageJsonSource).scripts?.["verify:static"];
  if (!script) throw new Error("package.json has no verify:static script");
  const match = script.match(/node --test\s+(.+)$/);
  if (!match) throw new Error("verify:static script has no `node --test` glob");
  return match[1].trim().split(/\s+/);
}

function stripLeadingDotSlash(path) {
  return path.replace(/^\.\//, "");
}

function isTestOnlyHelperPath(relativePath) {
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "test" || segment === "test-support")) return true;
  const basename = segments[segments.length - 1].replace(/\.[^.]+$/, "");
  return basename.split(/[-.]/).some((token) => token === "test");
}

// Tracked source files under an app's or package's `src` that exist only to support tests.
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
      ignore: ["**/node_modules/**", "**/dist/**"],
    },
  );
  return files.filter(isTestOnlyHelperPath).sort();
}

/** Every test file `pnpm verify` runs, plus its test-only helpers: the guard's full scan set. */
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

  return [
    ...new Set([...projectFiles, ...verifyStaticFiles, ...findTestOnlyHelperFiles(cwd)]),
  ].sort();
}
