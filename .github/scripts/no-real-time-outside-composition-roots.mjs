import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const SCANNED_GLOBS = [
  "apps/cloud/src/**/*.ts",
  "apps/pos/src/core/**/*.ts",
  "apps/pos/src/shared/**/*.ts",
  "packages/domain/src/**/*.ts",
];
const CLOUD_PACKAGE = "apps/cloud/package.json";
const REGISTER_BUILD_CONFIG = "apps/pos/electron.vite.config.ts";
const TEST_ONLY_DIRECTORIES = new Set(["test", "test-support"]);

const CLOCK_READS = ["Date.now", "performance.now", "performance.timeOrigin", "process.uptime"];
const CLOCK_NAMESPACES = ["process.hrtime", "Temporal.Now"];
const GLOBAL_OBJECTS = new Set(["globalThis", "global"]);
const CLOCK_MODULES = new Map([
  ["process", "process"],
  ["node:process", "process"],
  ["perf_hooks", undefined],
  ["node:perf_hooks", undefined],
]);

const DATABASE_CLOCK =
  /\b(?:now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday)\s*\(|\b(?:datetime|date|time|julianday|unixepoch)\s*\(\s*\)|\bstrftime\s*\(\s*'[^']*'\s*\)|\b(?:current_timestamp|current_date|current_time|localtimestamp|localtime)\b|'now'/i;

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

function withoutGlobalObject(name) {
  if (name === undefined) return undefined;
  const [first, ...rest] = name.split(".");
  return GLOBAL_OBJECTS.has(first) && rest.length > 0 ? rest.join(".") : name;
}

function joinName(...parts) {
  return parts.filter((part) => part !== undefined && part !== "").join(".");
}

function moduleMember(moduleName, exported) {
  return exported === "default" ? (moduleName ?? "") : joinName(moduleName, exported);
}

function isClockModule(node) {
  return node !== undefined && ts.isStringLiteral(node) && CLOCK_MODULES.has(node.text);
}

function clockModuleImports(sourceFile) {
  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !isClockModule(statement.moduleSpecifier)) {
      continue;
    }
    const moduleName = CLOCK_MODULES.get(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) imports.set(clause.name.text, moduleName ?? "");
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, moduleName ?? "");
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        imports.set(element.name.text, moduleMember(moduleName, imported));
      }
    }
  }
  return imports;
}

function resolveImport(name, imports) {
  if (name === undefined) return undefined;
  const [first, ...rest] = name.split(".");
  if (!imports.has(first)) return name;
  return joinName(imports.get(first), ...rest);
}

function isExpressionName(node) {
  if (ts.isPropertyAccessExpression(node)) return true;
  if (!ts.isIdentifier(node)) return false;
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isExportSpecifier(parent)
  ) {
    return false;
  }
  return !(
    (ts.isPropertyAssignment(parent) ||
      ts.isBindingElement(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent)) &&
    parent.name === node
  );
}

function isClockRead(name) {
  if (name === undefined) return false;
  return (
    CLOCK_READS.includes(name) ||
    CLOCK_NAMESPACES.some((namespace) => name === namespace || name.startsWith(`${namespace}.`))
  );
}

function exposesClock(name) {
  if (name === undefined) return false;
  return (
    name === "" ||
    [...CLOCK_READS, ...CLOCK_NAMESPACES].some(
      (clock) => clock === name || clock.startsWith(`${name}.`),
    ) ||
    isClockRead(name)
  );
}

function reexportsClock(statement, imports) {
  if (!ts.isExportDeclaration(statement)) return false;
  const clause = statement.exportClause;
  if (statement.moduleSpecifier !== undefined) {
    if (!isClockModule(statement.moduleSpecifier)) return false;
    if (clause === undefined || ts.isNamespaceExport(clause)) return true;
    const moduleName = CLOCK_MODULES.get(statement.moduleSpecifier.text);
    return clause.elements.some((element) =>
      exposesClock(moduleMember(moduleName, (element.propertyName ?? element.name).text)),
    );
  }
  return (
    clause !== undefined &&
    ts.isNamedExports(clause) &&
    clause.elements.some((element) =>
      exposesClock(resolveImport((element.propertyName ?? element.name).text, imports)),
    )
  );
}

function destructuresClock(pattern, objectName) {
  if (objectName === undefined) return false;
  return pattern.elements.some((element) => {
    const property = element.propertyName ?? element.name;
    if (!ts.isIdentifier(property) && !ts.isStringLiteral(property)) return false;
    const name = joinName(objectName, property.text);
    return ts.isObjectBindingPattern(element.name)
      ? destructuresClock(element.name, name)
      : exposesClock(name);
  });
}

function realClockReads(sourceFile) {
  const imports = clockModuleImports(sourceFile);
  const nameOf = (node) => resolveImport(withoutGlobalObject(dottedName(node)), imports);
  const isCurrentDateConstructor = (node) => nameOf(node) === "Date";
  const objectNameOf = (node) => (GLOBAL_OBJECTS.has(dottedName(node)) ? "" : nameOf(node));
  return descendants(sourceFile).flatMap((node) => {
    if (reexportsClock(node, imports)) {
      return [{ node, reason: "re-exports the real clock" }];
    }
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined &&
      destructuresClock(node.name, objectNameOf(node.initializer))
    ) {
      return [{ node, reason: "reads the real clock by destructuring it" }];
    }
    if (
      ts.isNewExpression(node) &&
      isCurrentDateConstructor(node.expression) &&
      (node.arguments?.length ?? 0) === 0
    ) {
      return [{ node, reason: "reads the real clock with new Date()" }];
    }
    if (ts.isCallExpression(node) && isCurrentDateConstructor(node.expression)) {
      return [{ node, reason: "reads the real clock with Date()" }];
    }
    if (isExpressionName(node) && isClockRead(nameOf(node))) {
      const outer = node.parent;
      const insideLongerRead =
        ts.isPropertyAccessExpression(outer) &&
        outer.expression === node &&
        isClockRead(nameOf(outer));
      if (!insideLongerRead) {
        return [{ node, reason: `reads the real clock with ${nameOf(node)}` }];
      }
    }
    return [];
  });
}

function isSqlTextNode(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

function databaseClockReads(sourceFile) {
  return descendants(sourceFile)
    .filter(isSqlTextNode)
    .flatMap((node) => {
      const match = DATABASE_CLOCK.exec(node.getText(sourceFile));
      if (!match) return [];
      return [
        {
          position: node.getStart(sourceFile) + match.index,
          reason: `reads the database's clock with ${match[0].replace(/\s*\($/, "()")} in SQL text`,
        },
      ];
    });
}

export function findRealTimeReads(source, fileName) {
  const sourceFile = parse(source, fileName);
  const reads = [
    ...realClockReads(sourceFile).map(({ node, reason }) => ({
      position: node.getStart(sourceFile),
      reason,
    })),
    ...databaseClockReads(sourceFile),
  ];

  const lineStarts = sourceFile.getLineStarts();
  return reads
    .map(({ position, reason }) => {
      const index = sourceFile.getLineAndCharacterOfPosition(position).line;
      const text = source.slice(lineStarts[index], lineStarts[index + 1] ?? source.length);
      return { line: index + 1, text: text.trim(), reason };
    })
    .sort((a, b) => a.line - b.line);
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findRealTimeReads(readFile(path), path).map((violation) => ({ path, ...violation })),
  );
}

export function describeViolation({ path, line, text, reason }) {
  return `${path}:${line}: ${text} (${reason})`;
}

export function readCloudRoots(packageJsonSource) {
  const scripts = Object.values(JSON.parse(packageJsonSource).scripts ?? {});
  const entries = scripts.flatMap((script) =>
    [...script.matchAll(/\bnode\b[^&;|]*?\bdist\/([\w-]+)\.js\b/g)].map(
      ([, name]) => `apps/cloud/src/${name}.ts`,
    ),
  );
  if (entries.length === 0) {
    throw new Error("The cloud's package.json scripts run no entry point as `node dist/<name>.js`");
  }
  return [...new Set(entries)].sort();
}

function propertyNamed(objectLiteral, name) {
  return objectLiteral.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name,
  )?.initializer;
}

export function readRegisterCoreRoot(configSource) {
  const sourceFile = parse(configSource, "electron.vite.config.ts");
  const input = descendants(sourceFile)
    .filter(ts.isObjectLiteralExpression)
    .map((node) => propertyNamed(node, "core"))
    .find((core) => core !== undefined);
  const path =
    input &&
    (ts.isStringLiteral(input)
      ? input.text
      : ts.isCallExpression(input) && ts.isStringLiteral(input.arguments[0])
        ? input.arguments[0].text
        : undefined);
  if (path === undefined) {
    throw new Error("The register's electron-vite config has no `core` input given as a path");
  }
  return `apps/pos/${path}`;
}

export function findCompositionRoots(cwd = process.cwd()) {
  const roots = [
    ...readCloudRoots(readFileSync(join(cwd, CLOUD_PACKAGE), "utf8")),
    readRegisterCoreRoot(readFileSync(join(cwd, REGISTER_BUILD_CONFIG), "utf8")),
  ];
  for (const root of roots) {
    if (!existsSync(join(cwd, root))) {
      throw new Error(`Composition root ${root} does not exist`);
    }
  }
  return roots.sort();
}

export function isScannedPath(relativePath) {
  if (!SCANNED_GLOBS.some((glob) => matchesGlob(relativePath, glob))) return false;
  if (relativePath.endsWith(".d.ts") || /\.test\.ts$/.test(relativePath)) return false;
  return !relativePath.split("/").some((segment) => TEST_ONLY_DIRECTORIES.has(segment));
}

function matchesGlob(relativePath, glob) {
  const prefix = glob.slice(0, glob.indexOf("**"));
  return relativePath.startsWith(prefix) && relativePath.endsWith(".ts");
}

export function findScannedFiles(cwd = process.cwd()) {
  const roots = new Set(findCompositionRoots(cwd));
  return globSync(SCANNED_GLOBS, { cwd, exclude: ["**/node_modules/**", "**/dist/**"] })
    .filter((path) => isScannedPath(path) && !roots.has(path))
    .sort();
}
