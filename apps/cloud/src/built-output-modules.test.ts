import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, inject, it } from "vitest";
import { cloudCommands } from "./test-support/cloud-commands.js";

const CLOUD_DIR = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_DIR = join(CLOUD_DIR, "src");

function entrypointSources(): string[] {
  return cloudCommands().map((command) => join(SOURCE_DIR, `${command}.ts`));
}

function isCloudSource(file: string): boolean {
  return !relative(SOURCE_DIR, file).startsWith("..");
}

function modulesLoadedBy(entrypoints: string[]): string[] {
  const config = ts.getParsedCommandLineOfConfigFile(join(CLOUD_DIR, "tsconfig.json"), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  if (!config) {
    throw new Error("apps/cloud/tsconfig.json could not be read");
  }
  const resolutions = ts.createModuleResolutionCache(CLOUD_DIR, (name) => name, config.options);
  const loaded = new Set<string>();
  const pending = [...entrypoints];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (loaded.has(file)) {
      continue;
    }
    loaded.add(file);
    const { importedFiles } = ts.preProcessFile(readFileSync(file, "utf8"), true, true);
    for (const { fileName } of importedFiles) {
      const imported = ts.resolveModuleName(
        fileName,
        file,
        config.options,
        ts.sys,
        resolutions,
      ).resolvedModule;
      if (imported && isCloudSource(imported.resolvedFileName)) {
        pending.push(imported.resolvedFileName);
      }
    }
  }
  return [...loaded].map((file) => relative(SOURCE_DIR, file).replace(/\.ts$/, ".js")).sort();
}

describe("the built cloud", () => {
  it("holds exactly the modules its entrypoints load", () => {
    const entrypoints = entrypointSources();
    const emitted = readdirSync(inject("cloudBuildDir"), { recursive: true, encoding: "utf8" })
      .filter((path) => path.endsWith(".js"))
      .sort();

    expect(entrypoints).not.toEqual([]);
    expect(emitted).toEqual(modulesLoadedBy(entrypoints));
  });
});
