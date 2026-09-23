import assert from "node:assert/strict";
import { test } from "node:test";
import { decideScope, diffChangedPaths, isDocumentationOnly, runCli } from "./change-scope.mjs";

const FROM_SHA = "c".repeat(40);
const TO_SHA = "d".repeat(40);

// isDocumentationOnly ----------------------------------------------------------------

test("treats a root Markdown file as documentation-only", () => {
  assert.equal(isDocumentationOnly("README.md"), true);
});

test("treats CONTRIBUTING.md as documentation-only", () => {
  assert.equal(isDocumentationOnly("CONTRIBUTING.md"), true);
});

test("treats a skill's Markdown file as documentation-only", () => {
  assert.equal(isDocumentationOnly(".claude/skills/open-pr/SKILL.md"), true);
});

test("treats a Markdown file under apps/ as needing the full verification", () => {
  assert.equal(isDocumentationOnly("apps/pos/CHANGELOG.md"), false);
});

test("treats a Markdown file under packages/ as needing the full verification", () => {
  assert.equal(isDocumentationOnly("packages/ui/README.md"), false);
});

test("treats the pull request template as needing the full verification", () => {
  assert.equal(isDocumentationOnly(".github/pull_request_template.md"), false);
});

test("treats a non-Markdown file as needing the full verification", () => {
  assert.equal(isDocumentationOnly("apps/cloud/src/server.ts"), false);
});

// decideScope --------------------------------------------------------------------------

test("keeps the full verification when a changed path is not documentation-only, naming it", () => {
  const decision = decideScope(["README.md", "apps/cloud/src/server.ts", "drafts/notes.md"]);

  assert.equal(decision.docsOnly, false);
  assert.match(decision.reason, /^apps\/cloud\/src\/server\.ts/);
});

test("skips to the docs-only path when every changed path is documentation-only", () => {
  const decision = decideScope(["README.md", "CONTRIBUTING.md", ".claude/skills/check/SKILL.md"]);

  assert.equal(decision.docsOnly, true);
});

test("keeps the full verification when the changed path list is empty", () => {
  const decision = decideScope([]);

  assert.equal(decision.docsOnly, false);
});

test("keeps the full verification when git could not produce the diff", () => {
  const decision = decideScope(null);

  assert.equal(decision.docsOnly, false);
});

// diffChangedPaths -----------------------------------------------------------------------

test("diffChangedPaths passes --no-renames to git", async () => {
  const requested = [];
  await diffChangedPaths({
    fromSha: FROM_SHA,
    toSha: TO_SHA,
    runGit: async (args) => {
      requested.push(args);
      return "";
    },
  });

  assert.ok(requested[0].includes("--no-renames"));
});

test("diffChangedPaths lists the changed paths git reports", async () => {
  const paths = await diffChangedPaths({
    fromSha: FROM_SHA,
    toSha: TO_SHA,
    runGit: async () => "README.md\napps/cloud/src/server.ts\n",
  });

  assert.deepEqual(paths, ["README.md", "apps/cloud/src/server.ts"]);
});

test("diffChangedPaths returns null when git fails", async () => {
  const paths = await diffChangedPaths({
    fromSha: FROM_SHA,
    toSha: TO_SHA,
    runGit: async () => {
      throw new Error("git diff exited with status 128");
    },
  });

  assert.equal(paths, null);
});

// runCli ---------------------------------------------------------------------------------

function fakeCli({ env = {} } = {}) {
  const calls = { git: [], outputs: [], logs: [], errors: [] };
  const deps = {
    env: {
      SCOPE_FROM: FROM_SHA,
      SCOPE_TO: TO_SHA,
      GITHUB_OUTPUT: "/output",
      ...env,
    },
    runGit: async (args) => {
      calls.git.push(args);
      return "README.md\n";
    },
    appendOutput: async (path, line) => {
      calls.outputs.push({ path, line });
    },
    log: (message) => calls.logs.push(message),
    logError: (message) => calls.errors.push(message),
  };
  return { deps, calls };
}

test("fails before any IO when GITHUB_OUTPUT is missing", async () => {
  const { deps, calls } = fakeCli({ env: { GITHUB_OUTPUT: "" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, []);
  assert.match(calls.errors.join("\n"), /GITHUB_OUTPUT/);
});

test("runs the full verification without calling git when SCOPE_FROM is missing", async () => {
  const { deps, calls } = fakeCli({ env: { SCOPE_FROM: "" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "docs_only=false\n" }]);
});

test("runs the full verification without calling git when SCOPE_TO is missing", async () => {
  const { deps, calls } = fakeCli({ env: { SCOPE_TO: "" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "docs_only=false\n" }]);
});

test("runs the full verification without calling git when SCOPE_FROM is all zeros", async () => {
  const { deps, calls } = fakeCli({ env: { SCOPE_FROM: "0".repeat(40) } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "docs_only=false\n" }]);
});

test("writes docs_only=true when every changed path is documentation-only", async () => {
  const { deps, calls } = fakeCli();
  deps.runGit = async (args) => {
    calls.git.push(args);
    return "README.md\nCONTRIBUTING.md\n";
  };

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "docs_only=true\n" }]);
});

test("writes docs_only=false when a changed path needs the full verification", async () => {
  const { deps, calls } = fakeCli();
  deps.runGit = async (args) => {
    calls.git.push(args);
    return "packages/ui/src/button.tsx\n";
  };

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "docs_only=false\n" }]);
});

test("writes docs_only=false when git could not produce the diff", async () => {
  const { deps, calls } = fakeCli();
  deps.runGit = async (args) => {
    calls.git.push(args);
    throw new Error("git diff exited with status 128");
  };

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "docs_only=false\n" }]);
});
