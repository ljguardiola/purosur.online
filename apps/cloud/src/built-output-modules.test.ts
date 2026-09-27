import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, inject, it } from "vitest";

const CLOUD_DIR = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_DIR = join(CLOUD_DIR, "src");

function entrypointSources(): string[] {
  const { scripts } = JSON.parse(readFileSync(join(CLOUD_DIR, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  return Object.values(scripts).flatMap((script) => {
    const entrypoint = /^node dist\/(.+)\.js$/.exec(script)?.[1];
    return entrypoint ? [join(SOURCE_DIR, `${entrypoint}.ts`)] : [];
  });
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
  return ts
    .createProgram(entrypoints, config.options)
    .getSourceFiles()
    .map((sourceFile) => relative(SOURCE_DIR, sourceFile.fileName))
    .filter((path) => !path.startsWith(".."))
    .map((path) => path.replace(/\.ts$/, ".js"))
    .sort();
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
