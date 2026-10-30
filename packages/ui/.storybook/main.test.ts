import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, expect, test } from "vitest";

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORYBOOK_CLI = join(
  dirname(createRequire(join(UI_DIR, "package.json")).resolve("storybook/package.json")),
  "dist/bin/dispatcher.js",
);

const outDir = mkdtempSync(join(tmpdir(), "purosur-catalog-build-"));

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

// The build ends on its own, succeeding or failing, so the test sets no timeout of its own.
test("the catalog builds from the workspace packages' source, without their compiled output", async () => {
  await promisify(execFile)(
    process.execPath,
    [STORYBOOK_CLI, "build", "-c", ".storybook", "-o", outDir, "--quiet"],
    { cwd: UI_DIR, env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: "1" } },
  );

  const index = JSON.parse(readFileSync(join(outDir, "index.json"), "utf8")) as {
    entries: Record<string, unknown>;
  };
  expect(Object.keys(index.entries)).not.toHaveLength(0);
}, 0);
