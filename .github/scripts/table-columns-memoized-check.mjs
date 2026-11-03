import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { parseSync, types as t, transformSync, traverse } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";
import { describeViolation, findTrackedFiles } from "./react-compiler-check.mjs";

const HOOK = "useTableModel";
const CHECKED_OPTIONS = ["columns", "items"];
const MODULE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const WRAPPER = /(^|\.)(memo|forwardRef)$/;

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
  return (
    t.isMemberExpression(inner) && inner.computed && t.isIdentifier(inner.object, { name: "$" })
  );
}

function calleeName(callee) {
  if (t.isIdentifier(callee)) return callee.name;
  if (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) {
    const property = t.isIdentifier(callee.property) ? callee.property.name : "[…]";
    return `${calleeName(callee.object)}.${property}`;
  }
  return "call";
}

function isHookName(name) {
  return /(^|\.)use[A-Z][^.]*$/.test(name);
}

const PRIMITIVE_GLOBAL_CALLS = new Set(["Number", "String", "Boolean", "parseInt", "parseFloat"]);

function isPrimitiveCall(path) {
  if (!path.isCallExpression()) return false;
  const name = calleeName(path.node.callee);
  const root = name.split(".")[0];
  if (path.scope.getBinding(root)) return false;
  return root === "Math" || PRIMITIVE_GLOBAL_CALLS.has(name);
}

function isComponentOrHook(functionPath) {
  const parent = functionPath.parentPath;
  if (
    parent.isCallExpression() &&
    /(^|\.)(memo|forwardRef)$/.test(calleeName(parent.node.callee))
  ) {
    return true;
  }
  const name =
    functionPath.node.id?.name ?? (parent.isVariableDeclarator() ? parent.node.id.name : undefined);
  return typeof name === "string" && /^([A-Z]|use[A-Z])/.test(name);
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
  for (
    let child = path, parent = path.parentPath;
    parent;
    child = parent, parent = parent.parentPath
  ) {
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

function functionName(functionPath) {
  let outer = functionPath;
  while (
    outer.parentPath.isCallExpression() &&
    WRAPPER.test(calleeName(outer.parentPath.node.callee))
  ) {
    outer = outer.parentPath;
  }
  const parent = outer.parentPath;
  if (functionPath.node.id) return functionPath.node.id.name;
  return parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)
    ? parent.node.id.name
    : undefined;
}

function componentOrHookAround(path) {
  let current = path.getFunctionParent();
  while (current && !isComponentOrHook(current)) current = current.parentPath.getFunctionParent();
  return current;
}

function memberKey(node) {
  if (!node.computed) return t.isIdentifier(node.property) ? node.property.name : undefined;
  if (t.isStringLiteral(node.property) || t.isNumericLiteral(node.property)) {
    return String(node.property.value);
  }
  return undefined;
}

function selectionIn(patternPath, name) {
  if (patternPath.isIdentifier()) {
    return patternPath.node.name === name ? { keys: [], defaults: [], rest: false } : null;
  }
  if (patternPath.isAssignmentPattern()) {
    const found = selectionIn(patternPath.get("left"), name);
    return found && { ...found, defaults: [patternPath.get("right"), ...found.defaults] };
  }
  if (patternPath.isRestElement()) {
    const found = selectionIn(patternPath.get("argument"), name);
    return found && { ...found, rest: true };
  }
  if (patternPath.isObjectPattern()) {
    for (const property of patternPath.get("properties")) {
      if (property.isRestElement()) {
        const found = selectionIn(property, name);
        if (found) return found;
        continue;
      }
      const found = selectionIn(property.get("value"), name);
      if (!found) continue;
      const key = keyNameOf(property);
      return key === undefined ? { ...found, keys: [] } : { ...found, keys: [key, ...found.keys] };
    }
  }
  if (patternPath.isArrayPattern()) {
    for (const [index, element] of patternPath.get("elements").entries()) {
      if (!element.node) continue;
      const found = selectionIn(element, name);
      if (!found) continue;
      return element.isRestElement()
        ? { ...found, keys: [], rest: false }
        : { ...found, keys: [String(index), ...found.keys] };
    }
  }
  return null;
}

function attributeName(attribute) {
  const name = attribute.node.name;
  return t.isJSXIdentifier(name) ? name.name : undefined;
}

function elementName(name) {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) return `${elementName(name.object)}.${name.property.name}`;
  return "element";
}

function isWithin(path, functionPath) {
  return path.node === functionPath.node || path.isDescendant(functionPath);
}

function aliasedCallee(calleePath) {
  const followed = new Set();
  let current = unwrapPath(calleePath);
  while (current.isIdentifier()) {
    const binding = current.scope.getBinding(current.node.name);
    const isAlias = binding?.path.isVariableDeclarator() && t.isIdentifier(binding.path.node.id);
    if (!isAlias || followed.has(binding)) return current;
    followed.add(binding);
    const sources = [binding.path.get("init")];
    for (const violation of binding.constantViolations) {
      if (!violation.isAssignmentExpression({ operator: "=" })) return current;
      sources.push(violation.get("right"));
    }
    const values = sources.filter((source) => source.node && !isCacheRead(source.node));
    const value = values.length === 1 ? unwrapPath(values[0]) : null;
    if (!value?.isIdentifier()) return current;
    current = value;
  }
  return current;
}

function along(label, outcomes) {
  return outcomes.map((outcome) => ({ ...outcome, trail: [label, ...outcome.trail] }));
}

function createAnalysis(project, file, root) {
  const bindingResults = new Map();
  const blockResults = new Map();

  function fresh(path) {
    const block = enclosingCacheBlock(path);
    return block ? checkBlock(block) : [{ trail: [describeNode(path.node)] }];
  }

  function checkBlock(block) {
    if (blockResults.has(block.node)) return blockResults.get(block.node);
    blockResults.set(block.node, []);
    const outcomes = cacheTestDeps(block.get("test")).flatMap((dep) => check(dep));
    blockResults.set(block.node, outcomes);
    return outcomes;
  }

  function checkAssigned(targetPath, valuePath, name, keys) {
    if (targetPath.isIdentifier()) return check(valuePath, keys);
    const selection = selectionIn(targetPath, name);
    if (!selection) return [{ trail: [`${name} (pattern)`] }];
    const defaults = selection.defaults.flatMap((value) => check(value, keys));
    if (selection.rest && keys.length === 0) return [...fresh(valuePath), ...defaults];
    return [...check(valuePath, [...selection.keys, ...keys]), ...defaults];
  }

  function checkParam(binding, name, keys) {
    if (binding.scope.path.node !== root.node) return [];
    const selection = selectionIn(binding.path, name);
    if (!selection) return [{ trail: [`${name} (parameter)`] }];
    const defaults = selection.defaults.flatMap((value) => check(value, keys));
    if (selection.rest && keys.length === 0) return [{ trail: [`rest of ${name}`] }, ...defaults];
    const param = { index: binding.path.key, keys: [...selection.keys, ...keys] };
    return [{ trail: [], param }, ...defaults];
  }

  function checkBinding(binding, name, keys) {
    if (binding.kind === "param") return checkParam(binding, name, keys);
    if (binding.kind === "module" || binding.kind === "local") return [];
    if (binding.kind === "hoisted") return [{ trail: [`function ${name}`] }];
    if (!binding.path.isVariableDeclarator()) return [{ trail: [`${name} (${binding.kind})`] }];

    const outcomes = [];
    const init = binding.path.get("init");
    if (init.node) outcomes.push(...checkAssigned(binding.path.get("id"), init, name, keys));
    for (const violation of binding.constantViolations) {
      if (!violation.isAssignmentExpression({ operator: "=" })) {
        return [{ trail: [`${name} (reassigned)`] }];
      }
      outcomes.push(...checkAssigned(violation.get("left"), violation.get("right"), name, keys));
    }
    return outcomes;
  }

  function checkIdentifier(path, keys) {
    const name = path.node.name;
    if (name === "undefined") return [];
    const binding = path.scope.getBinding(name);
    if (!binding || !isWithin(binding.scope.path, root)) return [];
    if (!bindingResults.has(binding)) bindingResults.set(binding, new Map());
    const results = bindingResults.get(binding);
    const key = keys.join("\0");
    if (!results.has(key)) {
      results.set(key, []);
      results.set(key, checkBinding(binding, name, keys));
    }
    return along(name, results.get(key));
  }

  function checkProperty(objectPath, keys) {
    const [key, ...rest] = keys;
    const outcomes = [];
    for (const property of objectPath.get("properties").reverse()) {
      if (property.isSpreadElement()) {
        outcomes.push(...check(property.get("argument"), keys));
        continue;
      }
      const matches = property.node.computed || keyNameOf(property) === key;
      if (!matches) continue;
      outcomes.push(
        ...(property.isObjectProperty() ? check(property.get("value"), rest) : fresh(property)),
      );
      if (!property.node.computed) break;
    }
    return outcomes;
  }

  function checkElement(arrayPath, keys) {
    const [key, ...rest] = keys;
    const elements = arrayPath.get("elements");
    const index = Number(key);
    if (elements.slice(0, index + 1).some((element) => element.isSpreadElement())) {
      return fresh(arrayPath);
    }
    return elements[index]?.node ? check(elements[index], rest) : [];
  }

  function checkArgument(callPath, { index, keys }) {
    const args = callPath.get("arguments");
    if (args.slice(0, index + 1).some((argument) => argument.isSpreadElement())) {
      return [{ trail: ["spread argument"] }];
    }
    return args[index] ? check(args[index], keys) : [];
  }

  function checkProps(elementPath, keys) {
    if (keys.length === 0) return check(elementPath.parentPath, []);
    const [prop, ...rest] = keys;
    const outcomes = [];
    for (const attribute of elementPath.get("attributes").reverse()) {
      if (attribute.isJSXSpreadAttribute()) {
        outcomes.push(...check(attribute.get("argument"), keys));
        continue;
      }
      if (attributeName(attribute) !== prop) continue;
      const value = attribute.get("value");
      if (value.isJSXExpressionContainer()) outcomes.push(...check(value.get("expression"), rest));
      return outcomes;
    }
    if (prop !== "children") return outcomes;
    for (const child of elementPath.parentPath.get("children")) {
      if (child.isJSXExpressionContainer()) outcomes.push(...check(child.get("expression"), []));
      if (child.isJSXElement() || child.isJSXFragment()) outcomes.push(...check(child, []));
    }
    return outcomes;
  }

  function checkHookCall(path, callee, keys) {
    const reference = project.referenceOf(file, callee);
    if (!reference) return [];
    const name = calleeName(callee.node);
    const outcomes = [];
    for (const outcome of project.returnOf(reference, keys)) {
      const trail = [`${name}(…)`, ...outcome.trail];
      if (!outcome.param) {
        outcomes.push({ trail });
        continue;
      }
      const label = `${name} argument ${outcome.param.index + 1}`;
      for (const passed of checkArgument(path, outcome.param)) {
        outcomes.push({ ...passed, trail: [...trail, label, ...passed.trail] });
      }
    }
    return outcomes;
  }

  function check(rawPath, keys = []) {
    const path = unwrapPath(rawPath);
    const node = path.node;
    if (
      t.isLiteral(node) ||
      t.isUnaryExpression(node) ||
      t.isBinaryExpression(node) ||
      t.isJSXEmptyExpression(node)
    ) {
      return [];
    }
    if (isCacheRead(node) || isPrimitiveCall(path)) return [];
    if (path.isIdentifier()) return checkIdentifier(path, keys);
    if (path.isMemberExpression() || path.isOptionalMemberExpression()) {
      const key = memberKey(node);
      return check(path.get("object"), key === undefined ? [] : [key, ...keys]);
    }
    if (path.isLogicalExpression()) {
      return [...check(path.get("left"), keys), ...check(path.get("right"), keys)];
    }
    if (path.isConditionalExpression()) {
      return [...check(path.get("consequent"), keys), ...check(path.get("alternate"), keys)];
    }
    if (path.isObjectExpression() && keys.length > 0) return checkProperty(path, keys);
    if (path.isArrayExpression() && /^\d+$/.test(keys[0] ?? "")) return checkElement(path, keys);
    if (path.isCallExpression() || path.isOptionalCallExpression()) {
      const callee = aliasedCallee(path.get("callee"));
      if (isHookName(calleeName(callee.node))) return checkHookCall(path, callee, keys);
    }
    return fresh(path);
  }

  return { check, checkArgument, checkProps };
}

function parserOptionsOf(path) {
  return { plugins: path.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"] };
}

function nameOf(node) {
  return t.isIdentifier(node) ? node.name : node.value;
}

function declaredNames(statement) {
  if (t.isFunctionDeclaration(statement) && statement.id) return [statement.id.name];
  if (!t.isVariableDeclaration(statement)) return [];
  return statement.declarations.filter((d) => t.isIdentifier(d.id)).map((d) => d.id.name);
}

function importedNameOf(specifier) {
  if (t.isImportDefaultSpecifier(specifier)) return "default";
  if (t.isImportNamespaceSpecifier(specifier)) return "*";
  return nameOf(specifier.imported);
}

function moduleIndexOf(path, source) {
  const ast = parseSync(source, {
    filename: path,
    babelrc: false,
    configFile: false,
    parserOpts: parserOptionsOf(path),
  });
  const index = { imports: new Map(), locals: new Set(), exports: new Map(), stars: [] };
  for (const statement of ast.program.body) {
    if (t.isImportDeclaration(statement)) {
      for (const specifier of statement.specifiers) {
        index.imports.set(specifier.local.name, {
          from: statement.source.value,
          imported: importedNameOf(specifier),
        });
      }
    } else if (t.isExportAllDeclaration(statement)) {
      index.stars.push(statement.source.value);
    } else if (t.isExportNamedDeclaration(statement)) {
      for (const name of declaredNames(statement.declaration)) {
        index.locals.add(name);
        index.exports.set(name, { local: name });
      }
      for (const specifier of statement.specifiers) {
        const exported = nameOf(specifier.exported);
        if (!statement.source) index.exports.set(exported, { local: specifier.local.name });
        else if (t.isExportSpecifier(specifier)) {
          index.exports.set(exported, {
            from: statement.source.value,
            imported: nameOf(specifier.local),
          });
        }
      }
    } else if (t.isExportDefaultDeclaration(statement)) {
      const declaration = statement.declaration;
      const name = t.isIdentifier(declaration) ? declaration.name : declaration.id?.name;
      if (name) index.exports.set("default", { local: name });
      if (name && !t.isIdentifier(declaration)) index.locals.add(name);
    } else {
      for (const name of declaredNames(statement)) index.locals.add(name);
    }
  }
  return index;
}

function createProject(files, packages) {
  const sources = new Map(files.map(({ path, source }) => [path, source]));
  const indexes = new Map();
  const programs = new Map();
  const analyses = new Map();
  const returns = new Map();

  function moduleOf(specifier, from) {
    if (Object.hasOwn(packages, specifier)) {
      return sources.has(packages[specifier]) ? packages[specifier] : null;
    }
    if (!specifier.startsWith(".")) return null;
    const stem = posix.join(posix.dirname(from), specifier).replace(/\.js$/, "");
    return MODULE_SUFFIXES.map((suffix) => stem + suffix).find((path) => sources.has(path)) ?? null;
  }

  function indexOf(path) {
    if (!indexes.has(path)) indexes.set(path, moduleIndexOf(path, sources.get(path)));
    return indexes.get(path);
  }

  function resolveLocal(path, name, seen = new Set()) {
    const imported = indexOf(path).imports.get(name);
    if (imported) {
      const target = moduleOf(imported.from, path);
      return target && imported.imported !== "*"
        ? resolveExport(target, imported.imported, seen)
        : null;
    }
    return indexOf(path).locals.has(name) ? { path, name } : null;
  }

  function resolveExport(path, name, seen = new Set()) {
    const key = `${path}#${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const index = indexOf(path);
    const entry = index.exports.get(name);
    if (entry?.local) return resolveLocal(path, entry.local, seen);
    if (entry) {
      const target = moduleOf(entry.from, path);
      return target && resolveExport(target, entry.imported, seen);
    }
    if (name === "default") return null;
    for (const star of index.stars) {
      const target = moduleOf(star, path);
      const found = target && resolveExport(target, name, seen);
      if (found) return found;
    }
    return null;
  }

  function programOf(path) {
    if (!programs.has(path)) {
      const { ast } = transformSync(sources.get(path), {
        filename: path,
        babelrc: false,
        configFile: false,
        ast: true,
        code: false,
        parserOpts: parserOptionsOf(path),
        plugins: [[reactCompiler, {}]],
      });
      let program;
      traverse(ast, {
        Program(programPath) {
          program = programPath;
          programPath.stop();
        },
      });
      programs.set(path, program);
    }
    return programs.get(path);
  }

  function referenceOf(path, nameOrCallee) {
    const node = nameOrCallee.node;
    if (t.isIdentifier(node) || t.isJSXIdentifier(node)) {
      const binding = nameOrCallee.scope.getBinding(node.name);
      return binding?.scope.path.isProgram() ? resolveLocal(path, node.name) : null;
    }
    const isMember =
      (t.isMemberExpression(node) && !node.computed) || t.isJSXMemberExpression(node);
    if (!isMember || !(t.isIdentifier(node.object) || t.isJSXIdentifier(node.object))) return null;
    const imported = indexOf(path).imports.get(node.object.name);
    const binding = nameOrCallee.scope.getBinding(node.object.name);
    if (imported?.imported !== "*" || !binding?.scope.path.isProgram()) return null;
    const target = moduleOf(imported.from, path);
    return target && resolveExport(target, node.property.name);
  }

  function functionOf(reference) {
    const binding = programOf(reference.path).scope.getBinding(reference.name);
    if (!binding) return null;
    if (binding.path.isFunctionDeclaration()) return binding.path;
    if (!binding.path.isVariableDeclarator() || !binding.path.node.init) return null;
    let init = unwrapPath(binding.path.get("init"));
    while (
      init.isCallExpression() &&
      WRAPPER.test(calleeName(init.node.callee)) &&
      init.node.arguments[0]
    ) {
      init = unwrapPath(init.get("arguments.0"));
    }
    return init.isFunction() ? init : null;
  }

  function analysisOf(path, functionPath) {
    if (!analyses.has(functionPath.node)) {
      analyses.set(functionPath.node, createAnalysis(project, path, functionPath));
    }
    return analyses.get(functionPath.node);
  }

  function returnOf(reference, keys) {
    const key = `${reference.path}#${reference.name}\0${keys.join("\0")}`;
    if (returns.has(key)) return returns.get(key);
    returns.set(key, []);
    const functionPath = functionOf(reference);
    let outcomes = [{ trail: [`${reference.name} cannot be followed`] }];
    if (functionPath) {
      const analysis = analysisOf(reference.path, functionPath);
      const body = functionPath.get("body");
      outcomes = [];
      if (!body.isBlockStatement()) outcomes.push(...analysis.check(body, keys));
      else {
        body.traverse({
          Function(inner) {
            inner.skip();
          },
          ReturnStatement(returned) {
            if (returned.node.argument)
              outcomes.push(...analysis.check(returned.get("argument"), keys));
          },
        });
      }
    }
    returns.set(key, outcomes);
    return outcomes;
  }

  function isReference(found, reference) {
    return found?.path === reference.path && found.name === reference.name;
  }

  function namesOf(reference) {
    const names = new Set([reference.name, posix.basename(reference.path).replace(/\.[^.]*$/, "")]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [path, source] of sources) {
        if (![...names].some((name) => source.includes(name))) continue;
        for (const exported of indexOf(path).exports.keys()) {
          if (!names.has(exported) && isReference(resolveExport(path, exported), reference)) {
            names.add(exported);
            grew = true;
          }
        }
      }
    }
    return [...names];
  }

  function callSitesOf(reference) {
    const names = namesOf(reference);
    const sites = [];
    for (const [path, source] of sources) {
      if (!names.some((name) => source.includes(name))) continue;
      programOf(path).traverse({
        JSXOpeningElement(element) {
          if (isReference(referenceOf(path, element.get("name")), reference)) {
            sites.push({ path, element });
          }
        },
        CallExpression(call) {
          if (isReference(referenceOf(path, call.get("callee")), reference))
            sites.push({ path, call });
        },
      });
    }
    return sites;
  }

  function ownerOf(path, functionPath) {
    const name = functionName(functionPath);
    const reference = name && resolveLocal(path, name);
    return reference?.path === path && functionOf(reference)?.node === functionPath.node
      ? reference
      : null;
  }

  const project = {
    analysisOf,
    callSitesOf,
    ownerOf,
    programOf,
    referenceOf,
    returnOf,
  };
  return project;
}

function optionsObjectOf(argumentPath) {
  const path = unwrapPath(argumentPath);
  if (path.isObjectExpression()) return path;
  if (!path.isIdentifier()) return null;
  const binding = path.scope.getBinding(path.node.name);
  if (!binding?.path.isVariableDeclarator()) return null;

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
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.property, { name: HOOK })
  );
}

function reasonOf(origin, site, trail) {
  const where =
    origin.path === site.path && origin.line === site.line
      ? ""
      : ` of ${origin.path}:${origin.line}`;
  return `${HOOK} ${origin.option}${where} is not memoized by the React Compiler (${trail.join(" <- ")})`;
}

function settle(project, site, outcomes, { trail, origin }, found) {
  let reported = false;
  for (const outcome of outcomes) {
    const full = [...trail, ...outcome.trail];
    const owner = outcome.param && project.ownerOf(site.path, site.functionPath);
    if (owner) {
      found.requirements.push({ owner, ...outcome.param, trail: full, origin });
      continue;
    }
    if (reported) continue;
    reported = true;
    const ending = outcome.param
      ? [...full, "a parameter of a function that is not a module-level component or hook"]
      : full;
    found.violations.push({
      path: site.path,
      line: site.line,
      reason: reasonOf(origin, site, ending),
    });
  }
}

function checkTable(project, path, callPath, functionPath, found) {
  const line = lineOf(callPath);
  const violation = (reason) => found.violations.push({ path, line, reason });
  const argument = callPath.get("arguments.0");
  const options = argument.node ? optionsObjectOf(argument) : null;

  if (!options) {
    violation(
      `${HOOK} options cannot be followed to an object literal (${argument.node ? describeNode(unwrap(argument.node)) : "no argument"})`,
    );
    return;
  }

  const analysis = project.analysisOf(path, functionPath);
  for (const option of CHECKED_OPTIONS) {
    const property = optionOf(options, option);
    if (property.missing) continue;
    if (property.unfollowable) {
      violation(`${HOOK} ${option} cannot be followed (${property.unfollowable})`);
      continue;
    }
    const valuePath = property.property.isObjectProperty()
      ? property.property.get("value")
      : property.property;
    const site = { path, line, functionPath };
    const origin = { option, path, line };
    settle(project, site, analysis.check(valuePath), { trail: [option], origin }, found);
  }
}

function checkCallSites(project, requirement, found) {
  const { owner, index, keys } = requirement;
  for (const { path, element, call } of project.callSitesOf(owner)) {
    const functionPath = componentOrHookAround(element ?? call);
    if (!functionPath || (element && index !== 0)) continue;
    const analysis = project.analysisOf(path, functionPath);
    const label = element
      ? `<${[elementName(element.node.name), ...keys.slice(0, 1)].join(" ")}>`
      : `${calleeName(call.node.callee)} argument ${index + 1}`;
    const outcomes = element
      ? analysis.checkProps(element, keys)
      : analysis.checkArgument(call, requirement);
    const site = { path, line: lineOf(element ?? call), functionPath };
    const trail = [...requirement.trail, label];
    settle(project, site, outcomes, { trail, origin: requirement.origin }, found);
  }
}

function requirementKey({ owner, index, keys, origin }) {
  return [owner.path, owner.name, index, ...keys, origin.path, origin.line, origin.option].join(
    "\0",
  );
}

export async function checkFiles(files, { packages = {} } = {}) {
  const project = createProject(files, packages);
  const found = { violations: [], requirements: [] };

  for (const { path, source } of files) {
    if (!source.includes(HOOK)) continue;
    project.programOf(path).traverse({
      CallExpression(callPath) {
        const enclosing = callPath.getFunctionParent();
        if (isHookCallee(callPath) && enclosing && isComponentOrHook(enclosing)) {
          checkTable(project, path, callPath, enclosing, found);
        }
      },
    });
  }

  const followed = new Set();
  while (found.requirements.length > 0) {
    const requirement = found.requirements.shift();
    const key = requirementKey(requirement);
    if (followed.has(key)) continue;
    followed.add(key);
    checkCallSites(project, requirement, found);
  }
  return found.violations;
}

function workspacePackagesOf(paths, readFile) {
  const packages = {};
  const roots = new Set(
    paths
      .filter((path) => path.startsWith("packages/"))
      .map((path) => path.split("/").slice(0, 2).join("/")),
  );
  for (const root of roots) {
    const manifest = JSON.parse(readFile(posix.join(root, "package.json")));
    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      if (typeof target === "string" && /\.tsx?$/.test(target)) {
        packages[posix.join(manifest.name, subpath)] = posix.join(root, target);
      }
    }
  }
  return packages;
}

export async function runCli({
  cwd = process.cwd(),
  findFiles = findTrackedFiles,
  readFile = (path) => readFileSync(path, "utf8"),
  logError = console.error,
} = {}) {
  const paths = findFiles(cwd);
  const files = paths.map((path) => ({ path, source: readFile(join(cwd, path)) }));
  const packages = workspacePackagesOf(paths, (path) => readFile(join(cwd, path)));
  const violations = await checkFiles(files, { packages });

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
