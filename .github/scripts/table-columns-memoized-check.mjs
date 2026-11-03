import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transformAsync, traverse, types as t } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";
import { describeViolation, findTrackedFiles } from "./react-compiler-check.mjs";

export { describeViolation, findTrackedFiles };

const HOOK = "useTableModel";
const CHECKED_OPTIONS = ["columns", "items"];

function unwrap(node) {
  let current = node;
  while (
    t.isTSAsExpression(current) ||
    t.isTSSatisfiesExpression(current) ||
    t.isTSNonNullExpression(current) ||
    t.isTSTypeAssertion(current) ||
    t.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function unwrapPath(path) {
  let current = path;
  while (
    current.isTSAsExpression() ||
    current.isTSSatisfiesExpression() ||
    current.isTSNonNullExpression() ||
    current.isTSTypeAssertion() ||
    current.isParenthesizedExpression()
  ) {
    current = current.get("expression");
  }
  return current;
}

function isCacheRead(node) {
  const inner = unwrap(node);
  return t.isMemberExpression(inner) && inner.computed && t.isIdentifier(inner.object, { name: "$" });
}

function calleeName(callee) {
  if (t.isIdentifier(callee)) return callee.name;
  if (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) {
    const property = t.isIdentifier(callee.property) ? callee.property.name : "[…]";
    return `${calleeName(callee.object)}.${property}`;
  }
  return "call";
}

function isHookCall(node) {
  if (!t.isCallExpression(node) && !t.isOptionalCallExpression(node)) return false;
  const name = calleeName(node.callee);
  return /(^|\.)use[A-Z][^.]*$/.test(name);
}

function describeNode(node) {
  if (t.isCallExpression(node) || t.isOptionalCallExpression(node)) {
    return `${calleeName(node.callee)}(…)`;
  }
  if (t.isNewExpression(node)) return `new ${calleeName(node.callee)}(…)`;
  if (t.isObjectExpression(node)) return "object literal";
  if (t.isArrayExpression(node)) return "array literal";
  if (t.isFunction(node)) return "inline function";
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return "JSX element";
  return node.type;
}

function cacheTestDeps(testPath) {
  if (testPath.isLogicalExpression({ operator: "||" })) {
    const left = cacheTestDeps(testPath.get("left"));
    const right = cacheTestDeps(testPath.get("right"));
    return left && right ? [...left, ...right] : null;
  }
  if (testPath.isBinaryExpression() && isCacheRead(testPath.node.left)) {
    if (testPath.node.operator === "!==") return [testPath.get("right")];
    if (testPath.node.operator === "===") return [];
  }
  return null;
}

function enclosingCacheBlock(path) {
  for (let child = path, parent = path.parentPath; parent; child = parent, parent = parent.parentPath) {
    if (parent.isFunction()) return null;
    if (
      parent.isIfStatement() &&
      child.key === "consequent" &&
      cacheTestDeps(parent.get("test")) !== null
    ) {
      return parent;
    }
  }
  return null;
}

function createAnalysis() {
  const bindingResults = new Map();
  const blockResults = new Map();

  function checkBlock(block) {
    if (blockResults.has(block.node)) return blockResults.get(block.node);
    blockResults.set(block.node, null);
    let result = null;
    for (const dep of cacheTestDeps(block.get("test"))) {
      result = check(dep);
      if (result) break;
    }
    blockResults.set(block.node, result);
    return result;
  }

  function checkSource(path) {
    if (isCacheRead(path.node)) return null;
    const block = enclosingCacheBlock(path);
    return block ? checkBlock(block) : check(path);
  }

  function checkBinding(binding, name) {
    if (binding.scope.path.isProgram()) return null;
    if (binding.kind === "param" || binding.kind === "module" || binding.kind === "local") {
      return null;
    }
    if (binding.kind === "hoisted") return [`function ${name}`];
    if (!binding.path.isVariableDeclarator()) return [`${name} (${binding.kind})`];

    const sources = [];
    const init = binding.path.get("init");
    if (init.node) sources.push(init);
    for (const violation of binding.constantViolations) {
      if (!violation.isAssignmentExpression({ operator: "=" })) {
        return [`${name} (reassigned)`];
      }
      sources.push(violation.get("right"));
    }
    for (const source of sources) {
      const result = checkSource(source);
      if (result) return result;
    }
    return null;
  }

  function checkIdentifier(path) {
    const name = path.node.name;
    if (name === "undefined") return null;
    const binding = path.scope.getBinding(name);
    if (!binding) return null;
    if (!bindingResults.has(binding)) {
      bindingResults.set(binding, null);
      bindingResults.set(binding, checkBinding(binding, name));
    }
    const result = bindingResults.get(binding);
    return result ? [name, ...result] : null;
  }

  function check(rawPath) {
    const path = unwrapPath(rawPath);
    const node = path.node;
    if (
      (t.isLiteral(node) && !t.isTemplateLiteral(node)) ||
      t.isTemplateLiteral(node) ||
      t.isUnaryExpression(node) ||
      t.isBinaryExpression(node)
    ) {
      return null;
    }
    if (isCacheRead(node) || isHookCall(node)) return null;
    if (path.isIdentifier()) return checkIdentifier(path);
    if (path.isMemberExpression() || path.isOptionalMemberExpression()) {
      return check(path.get("object"));
    }
    if (path.isLogicalExpression()) {
      return check(path.get("left")) ?? check(path.get("right"));
    }
    if (path.isConditionalExpression()) {
      return check(path.get("consequent")) ?? check(path.get("alternate"));
    }
    const block = enclosingCacheBlock(path);
    return block ? checkBlock(block) : [describeNode(node)];
  }

  return { check };
}

function optionsObjectOf(argumentPath) {
  const path = unwrapPath(argumentPath);
  if (path.isObjectExpression()) return path;
  if (!path.isIdentifier()) return null;
  const binding = path.scope.getBinding(path.node.name);
  if (!binding || !binding.path.isVariableDeclarator()) return null;

  const sources = [];
  const init = binding.path.get("init");
  if (init.node) sources.push(init);
  for (const violation of binding.constantViolations) {
    if (!violation.isAssignmentExpression({ operator: "=" })) return null;
    sources.push(violation.get("right"));
  }
  const objects = sources.map(unwrapPath).filter((source) => !isCacheRead(source.node));
  return objects.length === 1 && objects[0].isObjectExpression() ? objects[0] : null;
}

function keyNameOf(property) {
  if (property.node.computed) return undefined;
  const key = property.node.key;
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key)) return key.value;
  return undefined;
}

function optionOf(objectPath, option) {
  const properties = objectPath.get("properties");
  let found = null;
  let foundIndex = -1;
  let unknownAfter = false;
  properties.forEach((property, index) => {
    if (property.isSpreadElement() || (property.isObjectMember() && property.node.computed)) {
      unknownAfter = true;
      return;
    }
    if (keyNameOf(property) === option) {
      found = property;
      foundIndex = index;
      unknownAfter = false;
    }
  });
  if (unknownAfter) return { unfollowable: "spread or computed key" };
  if (foundIndex === -1) return { missing: true };
  return { property: found };
}

function lineOf(callPath) {
  const located = callPath.find((path) => path.node.loc);
  return located?.node.loc.start.line;
}

function isHookCallee(path) {
  const callee = path.node.callee;
  if (t.isIdentifier(callee)) {
    const binding = path.scope.getBinding(callee.name);
    if (binding?.path.isImportSpecifier()) {
      const imported = binding.path.node.imported;
      return (t.isIdentifier(imported) ? imported.name : imported.value) === HOOK;
    }
    return callee.name === HOOK;
  }
  return (
    t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.property, { name: HOOK })
  );
}

function violationsOfCall(callPath, path) {
  const line = lineOf(callPath);
  const violation = (reason) => ({ path, line, reason });
  const argument = callPath.get("arguments.0");
  const options = argument.node ? optionsObjectOf(argument) : null;

  if (!options) {
    return [
      violation(
        `${HOOK} options cannot be followed to an object literal (${argument.node ? describeNode(unwrap(argument.node)) : "no argument"})`,
      ),
    ];
  }

  const analysis = createAnalysis();
  const violations = [];
  for (const option of CHECKED_OPTIONS) {
    const found = optionOf(options, option);
    if (found.missing) continue;
    if (found.unfollowable) {
      violations.push(violation(`${HOOK} ${option} cannot be followed (${found.unfollowable})`));
      continue;
    }
    const valuePath = found.property.isObjectProperty() ? found.property.get("value") : found.property;
    const trail = analysis.check(valuePath);
    if (trail) {
      violations.push(
        violation(
          `${HOOK} ${option} is not memoized by the React Compiler (${[option, ...trail].join(" <- ")})`,
        ),
      );
    }
  }
  return violations;
}

async function violationsOf({ path, source }) {
  if (!source.includes(HOOK)) return [];

  const result = await transformAsync(source, {
    filename: path,
    babelrc: false,
    configFile: false,
    ast: true,
    code: false,
    parserOpts: { plugins: path.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"] },
    plugins: [[reactCompiler, {}]],
  });

  const violations = [];
  traverse(result.ast, {
    CallExpression(callPath) {
      if (isHookCallee(callPath)) violations.push(...violationsOfCall(callPath, path));
    },
  });
  return violations;
}

export async function checkFiles(files) {
  const violations = await Promise.all(files.map(violationsOf));
  return violations.flat();
}

export async function runCli({
  cwd = process.cwd(),
  findFiles = findTrackedFiles,
  readFile = (path) => readFileSync(path, "utf8"),
  logError = console.error,
} = {}) {
  const paths = findFiles(cwd);
  const files = paths.map((path) => ({ path, source: readFile(join(cwd, path)) }));
  const violations = await checkFiles(files);

  if (violations.length === 0) return 0;

  for (const violation of violations) logError(describeViolation(violation));
  logError(
    `table-columns-memoized-check: ${violations.length} ${HOOK} option(s) reach the table as a value the React Compiler left unmemoized.`,
  );
  return 1;
}

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
