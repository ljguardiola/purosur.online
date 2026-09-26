import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptsDir = join(repoRoot, ".github/scripts");
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

const directRuns = new Map();

function runDirectlyWithoutInputs(script) {
  if (!directRuns.has(script)) {
    directRuns.set(script, runWithoutInputs(join(scriptsDir, script)));
  }
  return directRuns.get(script);
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

test("no script under .github/scripts decides it was run directly from its start path", async () => {
  const scripts = (await readdir(scriptsDir)).filter(
    (file) => file.endsWith(".mjs") && !file.endsWith(".test.mjs"),
  );
  const readingStartPath = [];
  for (const script of scripts) {
    if ((await readFile(join(scriptsDir, script), "utf8")).includes("process.argv[1]")) {
      readingStartPath.push(script);
    }
  }

  assert.deepEqual(readingStartPath, []);
});

for (const script of entryScripts) {
  test(`${script} fails without its inputs when run directly`, () => {
    const direct = runDirectlyWithoutInputs(script);

    assert.equal(direct.status, 1, direct.stdout);
    assert.notEqual(direct.stdout + direct.stderr, "");
  });

  test(`${script} fails the same way when run through a linked directory`, async () => {
    await withTempDir(async (dir) => {
      const linkedRepo = join(dir, "repo");
      await symlink(repoRoot, linkedRepo, "junction");

      const result = runWithoutInputs(join(linkedRepo, ".github/scripts", script));
      const direct = runDirectlyWithoutInputs(script);

      assert.equal(result.status, direct.status);
      assert.equal(result.stderr, direct.stderr);
      assert.equal(result.stdout, direct.stdout);
    });
  });

  test(`${script} fails the same way from a path containing a space`, async () => {
    await withTempDir(async (dir) => {
      const copiedRepo = join(dir, "repo copy");
      await cp(scriptsDir, join(copiedRepo, ".github/scripts"), { recursive: true });
      await cp(
        join(repoRoot, ".railway/custom-domains.json"),
        join(copiedRepo, ".railway/custom-domains.json"),
      );
      await symlink(join(repoRoot, "node_modules"), join(copiedRepo, "node_modules"), "junction");

      const result = runWithoutInputs(join(copiedRepo, ".github/scripts", script));
      const direct = runDirectlyWithoutInputs(script);

      assert.equal(result.status, direct.status);
      assert.equal(result.stderr, direct.stderr);
      assert.equal(result.stdout, direct.stdout);
    });
  });
}
