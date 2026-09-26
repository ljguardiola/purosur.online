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

// --- Same-file functions -----------------------------------------------------------------------

function isFunctionValue(node) {
  return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

/** Every function declared in the file, by the name a call reaches it through. */
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

/** Nodes of `fn`'s own body, without descending into the functions nested in it. */
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

// --- Rule 1: measures real elapsed time -------------------------------------------------------

const DIRECT_CLOCK_READS = new Map([
  ["Date.now", "Date"],
  ["performance.now", "performance"],
  ["process.hrtime.bigint", "hrtime"],
  ["process.hrtime", "hrtime"],
  // Fake timers never replace process.uptime.
  ["process.uptime", "uptime"],
]);

/** The clock a call reads directly (`Date`, `performance`, `hrtime` or `uptime`), if any. */
function directClockRead(node) {
  if (ts.isNewExpression(node)) {
    return dottedName(node.expression) === "Date" && (node.arguments?.length ?? 0) === 0
      ? "Date"
      : undefined;
  }
  if (!ts.isCallExpression(node)) return undefined;
  return DIRECT_CLOCK_READS.get(dottedName(node.expression));
}

function isHrtimeWithArgument(node) {
  return (
    ts.isCallExpression(node) &&
    dottedName(node.expression) === "process.hrtime" &&
    node.arguments.length > 0
  );
}

/** Whether identifier `node` names a property or member rather than referencing a value. */
function isPropertyNamePosition(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (ts.isBindingElement(parent)) return parent.propertyName === node;
  if (ts.isShorthandPropertyAssignment(parent)) return false;
  return (
    (ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  );
}

/**
 * The clocks `node`, or anything inside it, reads: directly, through a clock-derived name, or by
 * calling a same-file function that returns a clock read.
 */
function clockReadsIn(node, clock) {
  const clocks = new Set();
  const visit = (n) => {
    const direct = directClockRead(n);
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

/** The expressions `fn` returns: an arrow's expression body or its own return statements. */
function returnedExpressions(fn) {
  if (!ts.isBlock(fn.body)) return [fn.body];
  return ownBodyNodes(fn)
    .filter((n) => ts.isReturnStatement(n) && n.expression)
    .map((n) => n.expression);
}

/**
 * Every name assigned, anywhere in the file, from an expression that reads the clock, and every
 * same-file function whose returned expression does, each with the clocks it carries, computed
 * together to a fixpoint.
 */
function computeClockSources(sourceFile, functions) {
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

  const clock = { names: new Map(), functions: new Map() };
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
  const expectCall = node.expression.expression;
  if (!ts.isCallExpression(expectCall) || dottedName(expectCall.expression) !== "expect") {
    return undefined;
  }
  return { a: expectCall.arguments[0], b: node.arguments[0] };
}

function elapsedTimeViolations(sourceFile, clock, fakeTimers) {
  const violations = [];
  const report = (node, clocks) => {
    if (![...clocks].every((c) => c !== "uptime" && fakeTimers.fakes(node, c))) {
      violations.push({ node, reason: "measures real elapsed time" });
    }
  };
  for (const node of descendants(sourceFile)) {
    if (isHrtimeWithArgument(node)) {
      report(node, ["hrtime"]);
      continue;
    }
    let operands;
    if (ts.isBinaryExpression(node) && REJECTED_COMPARISON_OPERATORS.has(node.operatorToken.kind)) {
      operands = { a: node.left, b: node.right };
    } else {
      operands = expectMatcherCallOperands(node);
    }
    if (!operands?.a || !operands.b) continue;
    const a = clockReadsIn(operands.a, clock);
    const b = clockReadsIn(operands.b, clock);
    if (a.size > 0 && b.size > 0) report(node, new Set([...a, ...b]));
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

/** The identifiers a binding name declares: the name itself or every name in its pattern. */
function boundIdentifiers(name) {
  if (ts.isIdentifier(name)) return [name];
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.flatMap((element) =>
      ts.isBindingElement(element) ? boundIdentifiers(element.name) : [],
    );
  }
  return [];
}

/** The identifiers `scope` itself declares, without those of the scopes nested in it. */
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

/** Resolves an identifier to the identifier that declares it in the nearest enclosing scope. */
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

/**
 * Declarations aliased from the global `setTimeout`/`setInterval`: assigned directly, through
 * `.bind(...)`, or destructured from the global object. Each declaring identifier maps to the
 * timer it reaches.
 */
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

/**
 * Local names bound to `setTimeout` and `scheduler` imported from `node:timers/promises`, and to
 * the module itself through a namespace or default import.
 */
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

/**
 * `{ delayIndex, timer, captured }` when `node` is a real timer call, given the file's aliases and
 * imports. `captured` marks a real timer taken before any fake timers could replace it.
 */
function classifyTimerCall(node, aliases, promisesBindings, resolve) {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;

  if (ts.isIdentifier(callee)) {
    // Checked first: `const { setTimeout } = globalThis` captures the timer under its own name.
    const alias = aliases.get(resolve(callee));
    if (alias) {
      return alias.capturesFake ? undefined : { delayIndex: 1, timer: alias.timer, captured: true };
    }
    if (callee.text === "setTimeout" || callee.text === "setInterval") {
      return { delayIndex: 1, timer: callee.text, captured: false };
    }
    if (promisesBindings.setTimeoutNames.has(callee.text)) {
      return { delayIndex: 0, timer: "setTimeout", captured: false };
    }
    return undefined;
  }

  const timer = globalTimerTarget(callee);
  if (timer) return { delayIndex: 1, timer, captured: ts.isCallExpression(callee) };

  const object = ts.isPropertyAccessExpression(callee) ? callee.expression : undefined;
  if (!object) return undefined;
  if (callee.name.text === "setTimeout" && promisesBindings.moduleNames.has(dottedName(object))) {
    return { delayIndex: 0, timer: "setTimeout", captured: false };
  }
  const scheduler = dottedName(object);
  const isScheduler =
    promisesBindings.schedulerNames.has(scheduler) ||
    (ts.isPropertyAccessExpression(object) &&
      object.name.text === "scheduler" &&
      promisesBindings.moduleNames.has(dottedName(object.expression)));
  if (callee.name.text === "wait" && isScheduler) {
    return { delayIndex: 0, timer: "setTimeout", captured: false };
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

function isBreakableStatement(node) {
  return isLoopStatement(node) || ts.isSwitchStatement(node);
}

/**
 * Whether `loop`'s body, without descending into a nested function, can leave the loop: a return,
 * a throw, or a break that exits this loop rather than an inner loop, switch or labeled statement.
 */
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

const ALL_FAKED = "*";

/** The strings of a string-literal array, or undefined for anything else. */
function stringLiterals(node) {
  if (!ts.isArrayLiteralExpression(node) || !node.elements.every(ts.isStringLiteralLike)) {
    return undefined;
  }
  return node.elements.map((element) => element.text);
}

// Entries are strings so that sets of them compare by value, which the fixpoints rely on to settle.
const ALL_EXCEPT_PREFIX = "allExcept:";

function allExcept(names) {
  return `${ALL_EXCEPT_PREFIX}${[...new Set(names)].sort().join(",")}`;
}

/**
 * What a `vi.useFakeTimers(...)` call fakes, as names plus `allExcept` entries. Options it
 * cannot read, and fake timers that advance with real time, fake nothing for this guard.
 */
function fakedByUseFakeTimers(call) {
  const [options] = call.arguments;
  if (!options) return [ALL_FAKED];
  if (
    !ts.isObjectLiteralExpression(options) ||
    options.properties.some(
      (property) => !ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name),
    )
  ) {
    return [];
  }
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

function isUseFakeTimersCall(node) {
  return ts.isCallExpression(node) && dottedName(node.expression) === "vi.useFakeTimers";
}

function isUseRealTimersCall(node) {
  return ts.isCallExpression(node) && dottedName(node.expression) === "vi.useRealTimers";
}

function isFakeTimersHook(expr) {
  const name = dottedName(expr);
  return name === "beforeEach" || name === "beforeAll";
}

/**
 * Which timers and clocks `vi.useFakeTimers` has replaced wherever a node runs. In an enclosing
 * function: what its own body installs before the node and has not restored by then, and what a
 * same-file function it calls leaves installed. Inside the arguments of a call to a same-file
 * function that installs and then restores fake timers: what that function installs. Plus what a
 * `beforeEach`/`beforeAll` hook installs in an enclosing `describe` or at the top of the file.
 */
function fakeTimersScope(sourceFile, functions) {
  // The same-file functions `fn`'s own body calls from `from` on and starting before `until`.
  const calledFunctionsBetween = (fn, from, until) =>
    ownBodyNodes(fn)
      .filter(
        (n) =>
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          functions.has(n.expression.text) &&
          n.getStart() >= from &&
          n.getStart() < until,
      )
      .flatMap((n) => functions.get(n.expression.text));

  // What `fn` leaves installed once it returns: what its own body installs, directly or through a
  // same-file call, after its last `vi.useRealTimers()`.
  const leftBy = new Map();
  const leaves = (fn) => {
    const nodes = ownBodyNodes(fn);
    const restoredAt = Math.max(-1, ...nodes.filter(isUseRealTimersCall).map((n) => n.getEnd()));
    const faked = new Set();
    for (const n of nodes) {
      if (n.getStart() < restoredAt || !ts.isCallExpression(n)) continue;
      if (isUseFakeTimersCall(n)) for (const entry of fakedByUseFakeTimers(n)) faked.add(entry);
      if (ts.isIdentifier(n.expression)) {
        for (const callee of functions.get(n.expression.text) ?? []) {
          for (const entry of leftBy.get(callee) ?? []) faked.add(entry);
        }
      }
    }
    return faked;
  };
  const namedFns = [...functions.values()].flat();
  for (const fn of namedFns) leftBy.set(fn, new Set());
  let changed = true;
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

  // What a same-file function whose own body installs fake timers and later restores the real
  // ones fakes while it runs, and so while the callbacks passed to it run.
  const bracketedBy = new Map(
    namedFns.map((fn) => {
      const nodes = ownBodyNodes(fn);
      const restores = nodes.filter(isUseRealTimersCall);
      const bracketed = nodes
        .filter(isUseFakeTimersCall)
        .filter((install) => restores.some((restore) => restore.getStart() >= install.getEnd()))
        .flatMap(fakedByUseFakeTimers);
      return [fn, bracketed];
    }),
  );

  // What `fn`'s own body installs after `from` and before `position`, and has not restored by then.
  const installedBefore = (fn, position, from = -1) => {
    const nodes = ownBodyNodes(fn);
    const restores = nodes.filter(isUseRealTimersCall);
    return nodes
      .filter(
        (install) =>
          isUseFakeTimersCall(install) &&
          install.getStart() >= from &&
          install.getEnd() <= position,
      )
      .filter(
        (install) =>
          !restores.some(
            (restore) => restore.getStart() >= install.getEnd() && restore.getEnd() <= position,
          ),
      )
      .flatMap(fakedByUseFakeTimers);
  };

  const hookInstalls = (suiteBodyNodes) =>
    suiteBodyNodes
      .filter((n) => ts.isCallExpression(n) && isFakeTimersHook(n.expression))
      .flatMap((hook) => {
        const [callback] = hook.arguments;
        if (isFunctionValue(callback)) return [...leftInstalled(callback)];
        if (callback && ts.isIdentifier(callback)) {
          return (functions.get(callback.text) ?? []).flatMap((fn) => [...leftInstalled(fn)]);
        }
        return [];
      });

  const topLevelNodes = sourceFile.statements.flatMap((statement) =>
    ts.isExpressionStatement(statement) ? [statement.expression] : [],
  );

  const enclosingFunctions = (node) => {
    const enclosing = [];
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isFunctionLike(current)) enclosing.push(current);
    }
    return enclosing;
  };

  // Where the last `vi.useRealTimers()` before `position`, in any enclosing function body, ends:
  // it ends every fake timer installed before it, by a hook, a helper or the body itself.
  const restoredBefore = (node, position) =>
    Math.max(
      -1,
      ...enclosingFunctions(node).flatMap((fn) =>
        ownBodyNodes(fn)
          .filter((n) => isUseRealTimersCall(n) && n.getEnd() <= position)
          .map((n) => n.getEnd()),
      ),
    );

  return {
    fakes(node, name) {
      const position = node.getStart();
      const restoredAt = restoredBefore(node, position);
      const faked = new Set(restoredAt < 0 ? hookInstalls(topLevelNodes) : []);
      for (
        let child = node, current = node.parent;
        current;
        child = current, current = current.parent
      ) {
        if (
          ts.isCallExpression(current) &&
          ts.isIdentifier(current.expression) &&
          current.arguments.includes(child) &&
          current.getStart() >= restoredAt
        ) {
          for (const fn of functions.get(current.expression.text) ?? []) {
            for (const entry of bracketedBy.get(fn)) faked.add(entry);
          }
        }
        if (!ts.isFunctionLike(current)) continue;
        for (const entry of installedBefore(current, position, restoredAt)) faked.add(entry);
        // Without a restore before the node, a helper installs for the whole body wherever it is
        // called; after one, only a helper called again before the node re-installs.
        const until = restoredAt < 0 ? Number.POSITIVE_INFINITY : position;
        for (const callee of calledFunctionsBetween(current, restoredAt, until)) {
          for (const entry of leftInstalled(callee)) faked.add(entry);
        }
        const call = current.parent;
        if (
          restoredAt < 0 &&
          call &&
          ts.isCallExpression(call) &&
          isDescribeCallee(call.expression) &&
          call.arguments.includes(current)
        ) {
          for (const n of hookInstalls(ownBodyNodes(current))) faked.add(n);
        }
      }
      return isFaked(faked, name);
    },

    // Whether the nearest function body enclosing `node` installs fake timers faking `name` before
    // `node` and has not restored them by then.
    installedDirectlyAt(node, name) {
      const [fn] = enclosingFunctions(node);
      return !!fn && isFaked(installedBefore(fn, node.getStart()), name);
    },
  };
}

function waitsRealTimeViolations(sourceFile, fakeTimers) {
  // A capture written after its own function body installs fake timers takes the fake timer.
  const aliases = new Map(
    [...globalTimerAliases(sourceFile)].map(([declaration, timer]) => [
      declaration,
      { timer, capturesFake: fakeTimers.installedDirectlyAt(declaration, timer) },
    ]),
  );
  const resolve = declarationResolver();
  const promisesBindings = timersPromisesBindings(sourceFile);
  const violations = [];

  for (const node of descendants(sourceFile)) {
    if (!ts.isCallExpression(node)) continue;

    if (isWaitForTimeoutCall(node)) {
      violations.push({ node, reason: "waits a fixed real time" });
      continue;
    }

    const timer = classifyTimerCall(node, aliases, promisesBindings, resolve);
    if (!timer) continue;

    const delayArg = node.arguments[timer.delayIndex];
    if (isZeroOrAbsentDelay(delayArg)) continue;
    if (isInsidePollingLoop(node)) continue;
    if (!timer.captured && fakeTimers.fakes(node, timer.timer)) continue;

    violations.push({ node, reason: "waits a fixed real time" });
  }
  return violations;
}

// --- Public API ---------------------------------------------------------------------------------

/** Violations in one source file's text, at their 1-indexed line and trimmed source text. */
export function findRealTimeViolations(source, fileName) {
  const sourceFile = parse(source, fileName);
  const functions = namedFunctions(sourceFile);
  const clock = computeClockSources(sourceFile, functions);
  const fakeTimers = fakeTimersScope(sourceFile, functions);
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

/** A `setupFiles`/`globalSetup` value's paths: one path or an array of them, each readable. */
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
