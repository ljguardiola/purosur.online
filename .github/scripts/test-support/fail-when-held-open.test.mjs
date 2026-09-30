import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const helperUrl = new URL("./fail-when-held-open.mjs", import.meta.url).href;

function runScript(body, options = {}) {
  const source = `import { failWhenHeldOpen } from ${JSON.stringify(helperUrl)};\n${body}`;
  return run(process.execPath, ["--input-type=module", "--eval", source], options);
}

test("a process something still holds open fails, naming what holds it", async () => {
  await assert.rejects(
    runScript("failWhenHeldOpen(50);\nsetInterval(() => {}, 1000);"),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /still held open 50 ms after its tests finished, by: Timeout/);
      return true;
    },
  );
});

test("a process nothing holds open exits on its own, without waiting for the bound", async () => {
  const { stderr } = await runScript("failWhenHeldOpen(600_000);", { timeout: 10_000 });

  assert.equal(stderr, "");
});
