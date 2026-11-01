import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";
import { startVitest } from "vitest/node";

const REPOSITORY_CONFIG = fileURLToPath(new URL("../../vitest.config.ts", import.meta.url));

async function repositoryPlugins() {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    REPOSITORY_CONFIG,
    undefined,
    "silent",
  );
  return loaded.config.plugins;
}

const GLOB_MODULE = [
  'const entries = import.meta.glob<string>("./entries/*.txt", {',
  '  query: "?raw",',
  '  import: "default",',
  "  eager: true,",
  "});",
  "export const ENTRY_NAMES = Object.keys(entries).sort();",
  "",
].join("\n");

const GLOB_TEST = [
  'import { readdirSync } from "node:fs";',
  'import { fileURLToPath } from "node:url";',
  'import { ENTRY_NAMES } from "./entries";',
  'test("lists every entry of the folder", () => {',
  '  const folder = fileURLToPath(new URL("./entries/", import.meta.url));',
  '  const files = ENTRY_NAMES.map((path) => path.slice("./entries/".length));',
  "  expect(files).toEqual(readdirSync(folder).sort());",
  "});",
  "",
].join("\n");

async function runVitest(root, cacheFolder) {
  const previousExitCode = process.exitCode;
  const vitest = await startVitest(
    "test",
    [],
    {
      root,
      config: false,
      watch: false,
      globals: true,
      fsModuleCache: true,
      fsModuleCachePath: cacheFolder,
      reporters: [{}],
    },
    { plugins: await repositoryPlugins() },
  );
  process.exitCode = previousExitCode;
  try {
    return vitest.state.getCountOfFailedTests();
  } finally {
    await vitest.close();
  }
}

test("a run sees a file a typed import.meta.glob matches after an earlier run cached the module", async () => {
  const root = mkdtempSync(join(tmpdir(), "glob-aware-module-cache-"));
  try {
    mkdirSync(join(root, "entries"));
    writeFileSync(join(root, "entries", "first.txt"), "first");
    writeFileSync(join(root, "entries.ts"), GLOB_MODULE);
    writeFileSync(join(root, "entries.test.ts"), GLOB_TEST);
    const cacheFolder = join(root, "module-cache");

    assert.equal(await runVitest(root, cacheFolder), 0);
    writeFileSync(join(root, "entries", "second.txt"), "second");

    assert.equal(await runVitest(root, cacheFolder), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
