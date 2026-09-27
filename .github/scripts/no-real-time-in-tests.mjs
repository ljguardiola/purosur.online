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

function accessedName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
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

function ownBodyNodes(fn) {
  const nodes = [];
  const visit = (n) => {
    nodes.push(n);
    if (ts.isFunctionLike(n)) return;
    ts.forEachChild(n, visit);
  };
  if (fn.body) visit(fn.body);
  return nodes;
}

const DIRECT_CLOCK_READS = new Map([
  ["Date.now", "Date"],
  ["performance.now", "performance"],
  ["process.hrtime.bigint", "hrtime"],
  ["process.hrtime", "hrtime"],
  ["process.uptime", "uptime"],
]);

// Fake timers never replace these clocks.
const NEVER_FAKED_CLOCKS = new Set(["uptime", "realSystemTime"]);

function directClockRead(node, viNames) {
  if (ts.isNewExpression(node)) {
    return dottedName(node.expression) === "Date" && (node.arguments?.length ?? 0) === 0
      ? "Date"
      : undefined;
  }
  if (!ts.isCallExpression(node)) return undefined;
  if (isViCall(node, "getRealSystemTime", viNames)) return "realSystemTime";
  return DIRECT_CLOCK_READS.get(dottedName(node.expression));
}

function isHrtimeWithArgument(node) {
  return (
    ts.isCallExpression(node) &&
    dottedName(node.expression) === "process.hrtime" &&
    node.arguments.length > 0
  );
}

function isPropertyNamePosition(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (ts.isBindingElement(parent)) return parent.propertyName === node;
  if (ts.isShorthandPropertyAssignment(parent)) return false;
  return (
    ts.isJsxAttribute(parent) ||
    ((ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isEnumMember(parent)) &&
      parent.name === node)
  );
}

function clockReadsIn(node, clock) {
  const clocks = new Set();
  const visit = (n) => {
    const direct = directClockRead(n, clock.viNames);
    if (direct) clocks.add(direct);
    if (isHrtimeWithArgument(n)) clocks.add("hrtime");
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      for (const c of clock.functions.get(n.expression.text) ?? []) clocks.add(c);
    }
    if (ts.isIdentifier(n) && !isPropertyNamePosition(n)) {
      for (const c of clock.names.get(n.text) ?? []) clocks.add(c);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return clocks;
}

function returnedExpressions(fn) {
  if (!ts.isBlock(fn.body)) return [fn.body];
  return ownBodyNodes(fn)
    .filter((n) => ts.isReturnStatement(n) && n.expression)
    .map((n) => n.expression);
}

function computeClockSources(sourceFile, functions, viNames) {
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
  const returns = [...functions].flatMap(([name, fns]) =>
    fns.flatMap((fn) => returnedExpressions(fn).map((expr) => ({ name, expr }))),
  );

  const clock = { names: new Map(), functions: new Map(), viNames };
  const merge = (map, name, clocks) => {
    const known = map.get(name) ?? new Set();
    const grown = [...clocks].filter((c) => !known.has(c));
    if (grown.length === 0) return false;
    map.set(name, new Set([...known, ...grown]));
    return true;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, expr } of assignments) {
      if (merge(clock.names, name, clockReadsIn(expr, clock))) changed = true;
    }
    for (const { name, expr } of returns) {
      if (merge(clock.functions, name, clockReadsIn(expr, clock))) changed = true;
    }
  }
  return clock;
}

function expectMatcherCallOperands(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression))
    return undefined;
  if (!ELAPSED_MATCHER_NAMES.has(node.expression.name.text)) return undefined;
  let expectCall = node.expression.expression;
  if (ts.isPropertyAccessExpression(expectCall) && expectCall.name.text === "not") {
    expectCall = expectCall.expression;
  }
  if (
    !ts.isCallExpression(expectCall) ||
    !["expect", "expect.soft"].includes(dottedName(expectCall.expression))
  ) {
    return undefined;
  }
  return { a: expectCall.arguments[0], b: node.arguments[0] };
}

function elapsedTimeViolations(sourceFile, clock, fakeTimers) {
  const reported = [];
  const report = (node, clocks) => {
    if (![...clocks].every((c) => !NEVER_FAKED_CLOCKS.has(c) && fakeTimers.fakes(node, c))) {
      reported.push(node);
    }
  };
  for (const node of descendants(sourceFile)) {
    if (isHrtimeWithArgument(node)) {
      report(node, ["hrtime"]);
      continue;
    }
    const isSubtraction =
      ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.MinusToken;
    let operands;
    if (
      ts.isBinaryExpression(node) &&
      (isSubtraction || RELATIONAL_OPERATORS.has(node.operatorToken.kind))
    ) {
      operands = { a: node.left, b: node.right };
    } else {
      operands = expectMatcherCallOperands(node);
    }
    if (!operands?.a || !operands.b) continue;
    const a = clockReadsIn(operands.a, clock);
    const b = clockReadsIn(operands.b, clock);
    const dependsOnClock = isSubtraction ? a.size > 0 && b.size > 0 : a.size > 0 || b.size > 0;
    if (dependsOnClock) report(node, new Set([...a, ...b]));
  }
  const isDescendantOf = (node, outer) => {
    for (let current = node.parent; current; current = current.parent) {
      if (current === outer) return true;
    }
    return false;
  };
  return reported
    .filter((node) => !reported.some((outer) => outer !== node && isDescendantOf(node, outer)))
    .map((node) => ({ node, reason: "measures real elapsed time" }));
}

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

const GLOBAL_OBJECTS = new Set(["globalThis", "window", "self"]);

function isScopeNode(node) {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isFunctionLike(node) ||
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isCaseBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isClassLike(node)
  );
}

function boundIdentifiers(name) {
  if (ts.isIdentifier(name)) return [name];
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.flatMap((element) =>
      ts.isBindingElement(element) ? boundIdentifiers(element.name) : [],
    );
  }
  return [];
}

function scopeDeclarations(scope) {
  const declared = [];
  if (ts.isFunctionLike(scope)) {
    for (const parameter of scope.parameters) declared.push(...boundIdentifiers(parameter.name));
    if ((ts.isFunctionExpression(scope) || ts.isClassExpression(scope)) && scope.name) {
      declared.push(scope.name);
    }
  }
  const visit = (n) => {
    if (ts.isVariableDeclaration(n)) declared.push(...boundIdentifiers(n.name));
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) declared.push(n.name);
    if (ts.isImportClause(n) && n.name) declared.push(n.name);
    if (ts.isNamespaceImport(n) || ts.isImportSpecifier(n)) declared.push(n.name);
    if (isScopeNode(n)) return;
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(scope, (child) => {
    if (ts.isFunctionLike(scope) && ts.isParameter(child)) return;
    visit(child);
  });
  return declared;
}

function declarationResolver() {
  const cache = new Map();
  return (identifier) => {
    for (let scope = identifier.parent; scope; scope = scope.parent) {
      if (!isScopeNode(scope)) continue;
      if (!cache.has(scope)) cache.set(scope, scopeDeclarations(scope));
      const declaration = cache.get(scope).find((declared) => declared.text === identifier.text);
      if (declaration) return declaration;
    }
    return undefined;
  };
}

function globalTimerAliases(sourceFile) {
  const aliases = new Map();
  for (const node of descendants(sourceFile)) {
    if (!ts.isVariableDeclaration(node) || !node.initializer) continue;
    if (ts.isIdentifier(node.name)) {
      const timer = globalTimerTarget(node.initializer);
      if (timer) aliases.set(node.name, timer);
    } else if (
      ts.isObjectBindingPattern(node.name) &&
      GLOBAL_OBJECTS.has(dottedName(node.initializer))
    ) {
      for (const element of node.name.elements) {
        const imported = (element.propertyName ?? element.name).getText();
        if (
          (imported === "setTimeout" || imported === "setInterval") &&
          ts.isIdentifier(element.name)
        ) {
          aliases.set(element.name, imported);
        }
      }
    }
  }
  return aliases;
}

function timersPromisesBindings(sourceFile) {
  const setTimeoutNames = new Set();
  const schedulerNames = new Set();
  const moduleNames = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (!["node:timers/promises", "timers/promises"].includes(statement.moduleSpecifier.text))
      continue;
    const clause = statement.importClause;
    if (clause?.name) moduleNames.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      moduleNames.add(bindings.name.text);
      continue;
    }
    for (const specifier of bindings.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text;
      if (imported === "setTimeout") setTimeoutNames.add(specifier.name.text);
      if (imported === "scheduler") schedulerNames.add(specifier.name.text);
    }
  }
  return { setTimeoutNames, schedulerNames, moduleNames };
}

// Fake timers replace only the global setTimeout/setInterval, never these imported from node:timers.
function callbackTimersBindings(sourceFile) {
  const timerNames = new Map();
  const moduleNames = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (!["node:timers", "timers"].includes(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause;
    if (clause?.name) moduleNames.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      moduleNames.add(bindings.name.text);
      continue;
    }
    for (const specifier of bindings.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text;
      if (imported === "setTimeout" || imported === "setInterval") {
        timerNames.set(specifier.name.text, imported);
      }
    }
  }
  return { timerNames, moduleNames };
}

function classifyTimerCall(node, aliases, promisesBindings, callbackBindings, resolve) {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;

  if (ts.isIdentifier(callee)) {
    const alias = aliases.get(resolve(callee));
    if (alias) {
      return alias.capturesFake ? undefined : { delayIndex: 1, timer: alias.timer, captured: true };
    }
    if (promisesBindings.setTimeoutNames.has(callee.text)) {
      return { delayIndex: 0, timer: "setTimeout", captured: true };
    }
    const imported = callbackBindings.timerNames.get(callee.text);
    if (imported) return { delayIndex: 1, timer: imported, captured: true };
    if (callee.text === "setTimeout" || callee.text === "setInterval") {
      return { delayIndex: 1, timer: callee.text, captured: false };
    }
    return undefined;
  }

  const timer = globalTimerTarget(callee);
  if (timer) return { delayIndex: 1, timer, captured: ts.isCallExpression(callee) };

  const object = ts.isPropertyAccessExpression(callee) ? callee.expression : undefined;
  if (!object) return undefined;
  if (
    (callee.name.text === "setTimeout" || callee.name.text === "setInterval") &&
    callbackBindings.moduleNames.has(dottedName(object))
  ) {
    return { delayIndex: 1, timer: callee.name.text, captured: true };
  }
  if (callee.name.text === "setTimeout" && promisesBindings.moduleNames.has(dottedName(object))) {
    return { delayIndex: 0, timer: "setTimeout", captured: true };
  }
  const scheduler = dottedName(object);
  const isScheduler =
    promisesBindings.schedulerNames.has(scheduler) ||
    (ts.isPropertyAccessExpression(object) &&
      object.name.text === "scheduler" &&
      promisesBindings.moduleNames.has(dottedName(object.expression)));
  if (callee.name.text === "wait" && isScheduler) {
    return { delayIndex: 0, timer: "setTimeout", captured: true };
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

function isBreakableStatement(node) {
  return isLoopStatement(node) || ts.isSwitchStatement(node);
}

function bodyHasCheckedExit(loop) {
  let found = false;
  const visit = (n, insideInnerBreakable, innerLabels) => {
    if (found) return;
    if (ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) || ts.isThrowStatement(n)) {
      found = true;
      return;
    }
    if (ts.isBreakStatement(n)) {
      found = n.label ? !innerLabels.has(n.label.text) : !insideInnerBreakable;
      return;
    }
    const labels = ts.isLabeledStatement(n) ? new Set([...innerLabels, n.label.text]) : innerLabels;
    const inner = insideInnerBreakable || isBreakableStatement(n);
    ts.forEachChild(n, (child) => visit(child, inner, labels));
  };
  visit(loop.statement, false, new Set());
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
  if (bodyHasCheckedExit(loop)) return true;
  return (
    (ts.isWhileStatement(loop) || ts.isDoStatement(loop)) && containsCallOrAwait(loop.expression)
  );
}

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

const ALL_FAKED = "*";

function stringLiterals(node) {
  if (!ts.isArrayLiteralExpression(node) || !node.elements.every(ts.isStringLiteralLike)) {
    return undefined;
  }
  return node.elements.map((element) => element.text);
}

const ALL_EXCEPT_PREFIX = "allExcept:";

function allExcept(names) {
  return `${ALL_EXCEPT_PREFIX}${[...new Set(names)].sort().join(",")}`;
}

function isReadableOptions(options) {
  return (
    ts.isObjectLiteralExpression(options) &&
    options.properties.every(
      (property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name),
    )
  );
}

function fakedByUseFakeTimers(call) {
  const [options] = call.arguments;
  if (!options) return [ALL_FAKED];
  if (!isReadableOptions(options)) return [];
  const advancesWithRealTime = propertyNamed(options, "shouldAdvanceTime");
  if (advancesWithRealTime && advancesWithRealTime.kind !== ts.SyntaxKind.FalseKeyword) return [];
  const toFake = propertyNamed(options, "toFake");
  if (toFake) return stringLiterals(toFake) ?? [];
  const toNotFake = propertyNamed(options, "toNotFake");
  if (toNotFake) {
    const kept = stringLiterals(toNotFake);
    return kept ? [allExcept(kept)] : [];
  }
  return [ALL_FAKED];
}

// What node:test's `mock.timers.enable()` fakes when its options list no `apis`.
const NODE_TEST_MOCKED_APIS = ["setTimeout", "setInterval", "setImmediate", "Date"];

function fakedByMockTimersEnable(call) {
  const [options] = call.arguments;
  if (!options) return NODE_TEST_MOCKED_APIS;
  if (!isReadableOptions(options)) return [];
  const apis = propertyNamed(options, "apis");
  if (!apis) return NODE_TEST_MOCKED_APIS;
  return stringLiterals(apis) ?? [];
}

function isFaked(faked, name) {
  return [...faked].some(
    (entry) =>
      entry === ALL_FAKED ||
      entry === name ||
      (entry.startsWith(ALL_EXCEPT_PREFIX) &&
        !entry.slice(ALL_EXCEPT_PREFIX.length).split(",").includes(name)),
  );
}

function isDescribeCallee(expr) {
  // `describe.each(table)("name", cb)` and its tagged-template form.
  if (ts.isCallExpression(expr)) return isDescribeCallee(expr.expression);
  if (ts.isTaggedTemplateExpression(expr)) return isDescribeCallee(expr.tag);
  const name = dottedName(expr);
  return name === "describe" || !!name?.startsWith("describe.");
}

function isDescribeCallback(fn) {
  const call = fn.parent;
  return (
    !!call &&
    ts.isCallExpression(call) &&
    isDescribeCallee(call.expression) &&
    call.arguments.includes(fn)
  );
}

// `before` is node:test's name for `beforeAll`.
function isFakeTimersHook(expr) {
  const name = dottedName(expr);
  return name === "beforeEach" || name === "beforeAll" || name === "before";
}

function vitestViNames(sourceFile) {
  const names = new Set(["vi"]);
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "vitest"
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      names.add(`${bindings.name.text}.vi`);
      continue;
    }
    for (const specifier of bindings.elements) {
      if ((specifier.propertyName ?? specifier.name).text === "vi") names.add(specifier.name.text);
    }
  }
  return names;
}

function isViCall(node, method, viNames) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === method &&
    viNames.has(dottedName(node.expression.expression))
  );
}

// node:test's `t.mock.timers` or the imported `mock.timers`.
function isMockTimersCall(node, method) {
  if (!ts.isCallExpression(node)) return false;
  const name = dottedName(node.expression);
  return name === `mock.timers.${method}` || !!name?.endsWith(`.mock.timers.${method}`);
}

function timerControl(sourceFile) {
  const viNames = vitestViNames(sourceFile);
  return {
    viNames,
    installs(node) {
      if (isViCall(node, "useFakeTimers", viNames)) return fakedByUseFakeTimers(node);
      if (isMockTimersCall(node, "enable")) return fakedByMockTimersEnable(node);
      return undefined;
    },
    restores(node) {
      return isViCall(node, "useRealTimers", viNames) || isMockTimersCall(node, "reset");
    },
  };
}

function ownScopeNodes(scope) {
  if (!ts.isSourceFile(scope)) return ownBodyNodes(scope);
  const nodes = [];
  const visit = (n) => {
    nodes.push(n);
    if (ts.isFunctionLike(n)) return;
    ts.forEachChild(n, visit);
  };
  for (const statement of scope.statements) visit(statement);
  return nodes;
}

function isCodeScope(node) {
  return ts.isSourceFile(node) || ts.isFunctionLike(node);
}

function callsByEnd(nodes) {
  return nodes.filter(ts.isCallExpression).sort((a, b) => a.getEnd() - b.getEnd());
}

function fakeTimersScope(functions, control) {
  const namedFns = [...functions.values()].flat();
  const calledFunctions = (call) =>
    ts.isCallExpression(call) && ts.isIdentifier(call.expression)
      ? (functions.get(call.expression.text) ?? [])
      : [];

  const restoring = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of namedFns) {
      if (restoring.has(fn)) continue;
      const restores = ownBodyNodes(fn).some(
        (n) => control.restores(n) || calledFunctions(n).some((callee) => restoring.has(callee)),
      );
      if (restores) {
        restoring.add(fn);
        changed = true;
      }
    }
  }
  const restoresThrough = (call) =>
    control.restores(call) || calledFunctions(call).some((callee) => restoring.has(callee));
  const fnRestores = (fn) => restoring.has(fn) || ownBodyNodes(fn).some(restoresThrough);

  const leftBy = new Map(namedFns.map((fn) => [fn, new Set()]));
  const leaves = (fn) => {
    const faked = new Set();
    for (const call of callsByEnd(ownBodyNodes(fn))) {
      if (restoresThrough(call)) faked.clear();
      for (const entry of control.installs(call) ?? []) faked.add(entry);
      for (const callee of calledFunctions(call)) {
        for (const entry of leftBy.get(callee) ?? []) faked.add(entry);
      }
    }
    return faked;
  };
  changed = true;
  while (changed) {
    changed = false;
    for (const fn of namedFns) {
      const known = leftBy.get(fn);
      for (const entry of leaves(fn)) {
        if (!known.has(entry)) {
          known.add(entry);
          changed = true;
        }
      }
    }
  }
  const leftInstalled = (fn) => leftBy.get(fn) ?? leaves(fn);

  const bracketedBy = new Map(
    namedFns.map((fn) => {
      const nodes = ownBodyNodes(fn);
      const restores = nodes.filter((n) => control.restores(n));
      const bracketed = nodes
        .filter((n) => control.installs(n))
        .filter((install) => restores.some((restore) => restore.getStart() >= install.getEnd()))
        .flatMap((install) => control.installs(install));
      return [fn, bracketed];
    }),
  );

  const applyCall = (faked, call) => {
    if (restoresThrough(call)) faked.clear();
    for (const entry of control.installs(call) ?? []) faked.add(entry);
    for (const callee of calledFunctions(call)) {
      for (const entry of leftInstalled(callee)) faked.add(entry);
    }
  };

  const runsDeferredIn = (scope, node) => {
    for (let current = node.parent; current && current !== scope; current = current.parent) {
      if (ts.isFunctionLike(current) && !isPromiseExecutor(current)) return true;
    }
    return false;
  };

  const applyOwnCode = (faked, scope, node) => {
    const position = node.getStart();
    const deferred = runsDeferredIn(scope, node);
    for (const call of callsByEnd(ownScopeNodes(scope))) {
      if (call.getEnd() <= position) {
        applyCall(faked, call);
      } else if (deferred && call.getStart() >= position) {
        for (const callee of calledFunctions(call)) {
          for (const entry of leftInstalled(callee)) faked.add(entry);
        }
      }
    }
  };

  const applyHooks = (faked, scope, node) => {
    const position = node.getStart();
    const hooks = ownScopeNodes(scope).filter(
      (n) =>
        ts.isCallExpression(n) &&
        isFakeTimersHook(n.expression) &&
        !(n.getStart() <= position && position < n.getEnd()),
    );
    for (const hook of hooks) {
      const [callback] = hook.arguments;
      let fns = [];
      if (isFunctionValue(callback)) fns = [callback];
      else if (callback && ts.isIdentifier(callback)) fns = functions.get(callback.text) ?? [];
      if (fns.some(fnRestores)) faked.clear();
      for (const fn of fns) for (const entry of leftInstalled(fn)) faked.add(entry);
    }
  };

  const applyBracket = (faked, call, child) => {
    if (!ts.isCallExpression(call) || !call.arguments.includes(child)) return;
    for (const fn of calledFunctions(call)) {
      for (const entry of bracketedBy.get(fn) ?? []) faked.add(entry);
    }
  };

  return {
    fakes(node, name) {
      const chain = [];
      for (
        let child = node, current = node.parent;
        current;
        child = current, current = current.parent
      ) {
        chain.unshift({ current, child });
      }
      let collected = 1;
      while (
        collected < chain.length &&
        (!ts.isFunctionLike(chain[collected].current) ||
          isDescribeCallback(chain[collected].current))
      ) {
        collected++;
      }
      const faked = new Set();
      const collection = chain.slice(0, collected);
      for (const { current, child } of collection) {
        if (isCodeScope(current)) applyOwnCode(faked, current, node);
        else applyBracket(faked, current, child);
      }
      for (const { current } of collection) {
        if (isCodeScope(current)) applyHooks(faked, current, node);
      }
      for (const { current, child } of chain.slice(collected)) {
        if (ts.isFunctionLike(current)) applyOwnCode(faked, current, node);
        else applyBracket(faked, current, child);
      }
      return isFaked(faked, name);
    },

    installedDirectlyAt(node, name) {
      let fn = node.parent;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      if (!fn) return false;
      const faked = new Set();
      for (const call of callsByEnd(ownBodyNodes(fn))) {
        if (call.getEnd() > node.getStart()) break;
        if (control.restores(call)) faked.clear();
        for (const entry of control.installs(call) ?? []) faked.add(entry);
      }
      return isFaked(faked, name);
    },
  };
}

function waitsRealTimeViolations(sourceFile, fakeTimers) {
  const aliases = new Map(
    [...globalTimerAliases(sourceFile)].map(([declaration, timer]) => [
      declaration,
      { timer, capturesFake: fakeTimers.installedDirectlyAt(declaration, timer) },
    ]),
  );
  const resolve = declarationResolver();
  const promisesBindings = timersPromisesBindings(sourceFile);
  const callbackBindings = callbackTimersBindings(sourceFile);
  const violations = [];

  for (const node of descendants(sourceFile)) {
    if (!ts.isCallExpression(node)) continue;

    if (isWaitForTimeoutCall(node)) {
      violations.push({ node, reason: "waits a fixed real time" });
      continue;
    }

    const timer = classifyTimerCall(node, aliases, promisesBindings, callbackBindings, resolve);
    if (!timer) continue;

    const delayArg = node.arguments[timer.delayIndex];
    if (isZeroOrAbsentDelay(delayArg)) continue;
    if (isInsidePollingLoop(node)) continue;
    if (!timer.captured && fakeTimers.fakes(node, timer.timer)) continue;

    violations.push({ node, reason: "waits a fixed real time" });
  }
  return violations;
}

export function findRealTimeViolations(source, fileName) {
  const sourceFile = parse(source, fileName);
  const functions = namedFunctions(sourceFile);
  const control = timerControl(sourceFile);
  const clock = computeClockSources(sourceFile, functions, control.viNames);
  const fakeTimers = fakeTimersScope(functions, control);
  const violations = [
    ...elapsedTimeViolations(sourceFile, clock, fakeTimers),
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
  if (ts.isCallExpression(node) && ts.isStringLiteral(node.arguments[0]))
    return node.arguments[0].text;
  return undefined;
}

function pathArrayProperty(objectLiteral, name) {
  const property = propertyNamed(objectLiteral, name);
  if (!property) return [];
  const elements = ts.isArrayLiteralExpression(property) ? property.elements : [property];
  return elements.map((element) => {
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

const TEST_ONLY_DIRECTORIES = new Set([
  "test",
  "tests",
  "__tests__",
  "test-support",
  "fixtures",
  "fakes",
]);

export function isTestOnlyHelperPath(relativePath) {
  const segments = relativePath.split("/");
  if (segments.slice(0, -1).some((segment) => TEST_ONLY_DIRECTORIES.has(segment))) return true;
  const basename = segments[segments.length - 1].replace(/\.[^.]+$/, "");
  return basename.split(/[-.]/).some((token) => token === "test");
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
  // A generated directory can end in the same extension the glob looks for, such as a screenshot
  // folder named after the test file it belongs to; only a real file's own content is relevant.
  return files
    .filter((path) => statSync(join(cwd, path)).isFile())
    .filter(isTestOnlyHelperPath)
    .sort();
}

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

  const scanned = new Set([...projectFiles, ...verifyStaticFiles, ...findTestOnlyHelperFiles(cwd)]);
  // A generated directory, such as a screenshot folder named after the test file it belongs to,
  // can match the same glob as the file it sits next to; only a real file has content to check.
  return [...scanned].filter((path) => statSync(join(cwd, path)).isFile()).sort();
}
