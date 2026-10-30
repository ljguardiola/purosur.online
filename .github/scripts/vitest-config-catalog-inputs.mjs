import { existsSync, globSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isCatalogInput } from "./change-scope.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VITEST_CONFIG = "vitest.config.ts";
const CATALOG_PROJECTS = ["catalog-visual", "catalog-build"];
const STORYBOOK_CONFIG_DIR = "packages/ui/.storybook";
const STORYBOOK_CONFIG_FILE = /^(main|manager|preview)\.[cm]?[jt]sx?$/;
const RESOLVED_EXTENSIONS = [".ts", ".mts", ".tsx", ".js", ".mjs"];
const SOURCE_FOR_EMITTED_EXTENSION = { ".js": [".ts", ".tsx"], ".mjs": [".mts"] };

const isRelative = (specifier) => specifier.startsWith("./") || specifier.startsWith("../");

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function importedSpecifier(node) {
  if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) return node.moduleSpecifier;
  if (ts.isExportDeclaration(node) && !node.isTypeOnly) return node.moduleSpecifier;
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments[0] !== undefined &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0];
  }
  return undefined;
}

export function findLocalImports(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  const visit = (node) => {
    const specifier = importedSpecifier(node);
    if (
      specifier !== undefined &&
      ts.isStringLiteralLike(specifier) &&
      isRelative(specifier.text)
    ) {
      imports.push({ specifier: specifier.text, line: lineOf(sourceFile, specifier) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

const isFile = (path) => existsSync(path) && statSync(path).isFile();

function resolveModule(root, importer, specifier) {
  const target = join(root, dirname(importer), specifier);
  const emittedExtension = Object.keys(SOURCE_FOR_EMITTED_EXTENSION).find((extension) =>
    target.endsWith(extension),
  );
  const candidates = [
    target,
    ...(emittedExtension === undefined
      ? []
      : SOURCE_FOR_EMITTED_EXTENSION[emittedExtension].map(
          (extension) => target.slice(0, -emittedExtension.length) + extension,
        )),
    ...RESOLVED_EXTENSIONS.map((extension) => target + extension),
    ...RESOLVED_EXTENSIONS.map((extension) => join(target, `index${extension}`)),
  ];
  const resolved = candidates.find(isFile);
  return resolved === undefined ? undefined : normalize(relative(root, resolved));
}

const notCatalogInput = (path, reason) =>
  `${path}, ${reason}, is not a catalog input in .github/scripts/change-scope.mjs`;

export function findUndeclaredModules({ root, entries }) {
  const violations = entries
    .filter(({ path }) => !isCatalogInput(path))
    .map(({ path, namedBy }) => notCatalogInput(path, namedBy));
  const visited = new Set(entries.map(({ path }) => path));
  const pending = entries.map(({ path }) => path);
  while (pending.length > 0) {
    const importer = pending.shift();
    for (const { specifier, line } of findLocalImports(
      readFileSync(join(root, importer), "utf8"),
      importer,
    )) {
      const module = resolveModule(root, importer, specifier);
      if (module === undefined || visited.has(module)) continue;
      visited.add(module);
      pending.push(module);
      if (!isCatalogInput(module)) {
        violations.push(notCatalogInput(module, `imported at ${importer}:${line}`));
      }
    }
  }
  return violations;
}

const asList = (value) => (value === undefined ? [] : [value].flat());

export function catalogEntryFiles(config, root) {
  return CATALOG_PROJECTS.flatMap((name) => {
    const project = config.test?.projects?.find((entry) => entry.test?.name === name);
    const named = (role, paths) =>
      paths.map((path) => ({
        path,
        namedBy: `named by ${VITEST_CONFIG} as a ${role} of the ${name} project`,
      }));
    const fromRoot = (paths) => asList(paths).map((path) => relative(root, path));
    const testFiles = asList(project?.test?.include)
      .flatMap((pattern) => globSync(pattern, { cwd: root }))
      .filter((path) => isFile(join(root, path)))
      .sort();
    return [
      ...named("global setup", fromRoot(project?.test?.globalSetup)),
      ...named("setup file", fromRoot(project?.test?.setupFiles)),
      ...named("test file", testFiles),
    ];
  });
}

function storybookConfigFiles(root) {
  const directory = join(root, STORYBOOK_CONFIG_DIR);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => STORYBOOK_CONFIG_FILE.test(name))
    .sort()
    .map((name) => ({
      path: join(STORYBOOK_CONFIG_DIR, name),
      namedBy: "read by the catalog build as its Storybook config",
    }));
}

export async function checkRepository({
  root = REPOSITORY_ROOT,
  importConfig = () => import(join(root, VITEST_CONFIG)),
} = {}) {
  const { default: config } = await importConfig();
  return findUndeclaredModules({
    root,
    entries: [
      { path: VITEST_CONFIG, namedBy: "the vitest config" },
      ...catalogEntryFiles(config, root),
      ...storybookConfigFiles(root),
    ],
  });
}
