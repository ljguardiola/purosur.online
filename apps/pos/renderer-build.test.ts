import { fileURLToPath } from "node:url";
import { resolveConfig } from "electron-vite";
import { build, type Rollup } from "vite";
import { beforeAll, expect, test } from "vitest";

const POS_ROOT = fileURLToPath(new URL(".", import.meta.url));

let chunks: Rollup.OutputChunk[];

beforeAll(async () => {
  const { config } = await resolveConfig(
    { root: POS_ROOT, configFile: `${POS_ROOT}electron.vite.config.ts`, logLevel: "silent" },
    "build",
  );
  const renderer = config?.renderer ?? {};
  const output = (await build({
    ...renderer,
    root: `${POS_ROOT}src/renderer`,
    configFile: false,
    build: { ...renderer.build, write: false },
  })) as Rollup.RollupOutput;
  chunks = output.output.filter((file): file is Rollup.OutputChunk => file.type === "chunk");
}, 60_000);

test("the renderer carries the design system's screen-reader texts only in Spanish", () => {
  const translations = chunks
    .flatMap((chunk) => chunk.moduleIds)
    .flatMap(
      (moduleId) =>
        moduleId.match(/[\\/]intl[\\/](?:.+[\\/])?([a-z]{2}-[A-Z]{2})\.m?js$/)?.[1] ?? [],
    );

  expect(new Set(translations)).toEqual(new Set(["es-ES"]));
});
