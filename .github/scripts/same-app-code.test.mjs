import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("./same-app-code.mjs", import.meta.url));

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "same-app-code-cli-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runCli(scriptPath, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}

test("the CLI exits 0 when two app.asar files carry the same code", async () => {
  await withTempDir(async (dir) => {
    const first = join(dir, "first.asar");
    const second = join(dir, "second.asar");
    await writeFile(first, "same app code");
    await writeFile(second, "same app code");

    const result = runCli(cliPath, [first, second]);

    assert.equal(result.status, 0, result.stderr);
  });
});

test("the CLI exits non-zero when two app.asar files differ", async () => {
  await withTempDir(async (dir) => {
    const first = join(dir, "first.asar");
    const second = join(dir, "second.asar");
    await writeFile(first, "app code");
    await writeFile(second, "other app code");

    const result = runCli(cliPath, [first, second]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /app\.asar differs/);
  });
});

test("the CLI still compares when it is run through a symlink", async () => {
  await withTempDir(async (dir) => {
    const first = join(dir, "first.asar");
    const second = join(dir, "second.asar");
    await writeFile(first, "app code");
    await writeFile(second, "other app code");
    const linkedCli = join(dir, "same-app-code.mjs");
    await symlink(cliPath, linkedCli);

    const result = runCli(linkedCli, [first, second]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /app\.asar differs/);
  });
});
