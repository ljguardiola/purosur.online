import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const HOOK = new URL("../../.claude/hooks/pretool.mjs", import.meta.url);

function runHook(command) {
  return spawnSync(process.execPath, [HOOK.pathname], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
}

test("a refused command points at the rules in .claude/rules/", () => {
  const result = runHook("git push --force origin feat/1-example");

  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /^This command violates the repository contract \(see \.claude\/rules\/\):\n/,
  );
});

test("an allowed command passes silently", () => {
  const result = runHook("git status");

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});
