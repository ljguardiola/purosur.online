import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const workflowsDir = join(repoRoot, ".github/workflows");

async function scriptsRunByWorkflows() {
  const scripts = new Set();
  for (const file of await readdir(workflowsDir)) {
    const workflow = await readFile(join(workflowsDir, file), "utf8");
    for (const match of workflow.matchAll(/node \.github\/scripts\/([\w-]+\.mjs)/g)) {
      scripts.add(match[1]);
    }
  }
  return [...scripts].sort();
}

// Run by hand against Cloudflare rather than from a workflow.
const scriptsRunByOperators = ["apply-edge-rules.mjs"];

const entryScripts = [...(await scriptsRunByWorkflows()), ...scriptsRunByOperators];

function runWithoutInputs(scriptPath) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
}

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "script entry paths "));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the workflows run at least one script under .github/scripts", () => {
  assert.ok(entryScripts.length > scriptsRunByOperators.length);
});

for (const script of entryScripts) {
  const direct = runWithoutInputs(join(repoRoot, ".github/scripts", script));

  test(`${script} fails without its inputs when run directly`, () => {
    assert.equal(direct.status, 1, direct.stdout);
    assert.notEqual(direct.stdout + direct.stderr, "");
  });

  test(`${script} fails the same way when run through a linked directory`, async () => {
    await withTempDir(async (dir) => {
      const linkedRepo = join(dir, "repo");
      await symlink(repoRoot, linkedRepo, "junction");

      const result = runWithoutInputs(join(linkedRepo, ".github/scripts", script));

      assert.equal(result.status, direct.status);
      assert.equal(result.stderr, direct.stderr);
      assert.equal(result.stdout, direct.stdout);
    });
  });

  test(`${script} fails the same way from a path containing a space`, async () => {
    await withTempDir(async (dir) => {
      const copiedRepo = join(dir, "repo copy");
      await cp(join(repoRoot, ".github/scripts"), join(copiedRepo, ".github/scripts"), {
        recursive: true,
      });
      await cp(
        join(repoRoot, ".railway/custom-domains.json"),
        join(copiedRepo, ".railway/custom-domains.json"),
      );

      const result = runWithoutInputs(join(copiedRepo, ".github/scripts", script));

      assert.equal(result.status, direct.status);
      assert.equal(result.stderr, direct.stderr);
      assert.equal(result.stdout, direct.stdout);
    });
  });
}
