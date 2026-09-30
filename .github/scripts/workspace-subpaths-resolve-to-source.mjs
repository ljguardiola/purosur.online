import { globSync, readFileSync, realpathSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";
import { parse } from "yaml";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findWorkspacePackages(root) {
  const { packages } = parse(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
  return globSync(
    packages.map((pattern) => `${pattern}/package.json`),
    { cwd: root },
  )
    .sort()
    .map((manifestPath) => {
      const directory = manifestPath.slice(0, -"/package.json".length);
      return { directory, manifest: readJson(join(root, manifestPath)) };
    });
}

function exportedSpecifiers({ name, exports = {} }) {
  return Object.keys(exports)
    .filter((subpath) => extname(subpath) === "")
    .map((subpath) => (subpath === "." ? name : `${name}${subpath.slice(1)}`));
}

export function findWorkspaceSubpathImports(root = process.cwd()) {
  const workspacePackages = findWorkspacePackages(root);
  return workspacePackages.flatMap(({ directory, manifest }) => {
    const dependencyNames = new Set(
      Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }),
    );
    return workspacePackages
      .filter((dependency) => dependencyNames.has(dependency.manifest.name))
      .flatMap((dependency) =>
        exportedSpecifiers(dependency.manifest).map((specifier) => ({
          specifier,
          consumer: manifest.name,
          consumerDirectory: directory,
          dependencyDirectory: dependency.directory,
        })),
      );
  });
}

function rootCompilerOptions(root) {
  const parsed = ts.getParsedCommandLineOfConfigFile(join(root, "tsconfig.json"), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  return parsed.options;
}

export function findSubpathsNotResolvingToSource(root = process.cwd()) {
  const realRoot = realpathSync(root);
  const options = rootCompilerOptions(root);

  return findWorkspaceSubpathImports(root).flatMap(
    ({ specifier, consumer, consumerDirectory, dependencyDirectory }) => {
      const containingFile = join(realRoot, consumerDirectory, "src", "index.ts");
      const { resolvedModule } = ts.resolveModuleName(specifier, containingFile, options, ts.sys);
      const sourceDirectory = `${join(realRoot, dependencyDirectory, "src")}/`;
      if (resolvedModule?.resolvedFileName.startsWith(sourceDirectory)) {
        return [];
      }
      return [
        {
          specifier,
          consumer,
          resolvedPath: resolvedModule && relative(realRoot, resolvedModule.resolvedFileName),
        },
      ];
    },
  );
}

export function describeUnresolvedSubpath({ specifier, consumer, resolvedPath }) {
  const outcome =
    resolvedPath === undefined
      ? "does not resolve"
      : `resolves to ${resolvedPath} instead of the package's source`;
  return `${specifier}, imported from ${consumer}, ${outcome}`;
}
