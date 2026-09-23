import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideDeploy,
  diffChangedPaths,
  fetchStagingVersion,
  isAncestor,
  isIrrelevantToCloud,
  runCli,
} from "./cloud-changed.mjs";

const STAGING_SHA = "a".repeat(40);
const TARGET_SHA = "b".repeat(40);

// isIrrelevantToCloud --------------------------------------------------------------

test("treats a register-app file as irrelevant", () => {
  assert.equal(isIrrelevantToCloud("apps/pos/src/register.ts"), true);
});

test("treats any markdown file as irrelevant", () => {
  assert.equal(isIrrelevantToCloud("drafts/odd/tasks/deploy-only-cloud-changes.md"), true);
});

test("treats a Claude config file as irrelevant", () => {
  assert.equal(isIrrelevantToCloud(".claude/settings.json"), true);
});

test("treats an ordinary .github file as irrelevant", () => {
  assert.equal(isIrrelevantToCloud(".github/dependabot.yml"), true);
});

test("treats the deploy workflow itself as relevant", () => {
  assert.equal(isIrrelevantToCloud(".github/workflows/deploy-cloud-staging.yml"), false);
});

test("treats a non-test automation script as relevant", () => {
  assert.equal(isIrrelevantToCloud(".github/scripts/verify-cloud-health.mjs"), false);
});

test("treats an automation script's own test file as irrelevant", () => {
  assert.equal(isIrrelevantToCloud(".github/scripts/verify-cloud-health.test.mjs"), true);
});

test("treats a file nested under .github/scripts as irrelevant, not a direct-child exception", () => {
  assert.equal(isIrrelevantToCloud(".github/scripts/lib/helper.mjs"), true);
});

test("treats a cloud app file as relevant", () => {
  assert.equal(isIrrelevantToCloud("apps/cloud/src/server.ts"), false);
});

test("treats a root config file as relevant", () => {
  assert.equal(isIrrelevantToCloud("package.json"), false);
});

test("treats a shared package file as relevant", () => {
  assert.equal(isIrrelevantToCloud("packages/ui/src/button.tsx"), false);
});

// decideDeploy ----------------------------------------------------------------------

test("deploys when staging's version is not a commit SHA", () => {
  const decision = decideDeploy({
    targetSha: TARGET_SHA,
    stagingVersion: "dev",
    stagingIsAncestor: false,
    changedPaths: null,
  });

  assert.equal(decision.deploy, true);
  assert.match(decision.reason, /"dev"/);
});

test("deploys when staging's commit is not an ancestor of the target", () => {
  const decision = decideDeploy({
    targetSha: TARGET_SHA,
    stagingVersion: STAGING_SHA,
    stagingIsAncestor: false,
    changedPaths: null,
  });

  assert.equal(decision.deploy, true);
  assert.match(decision.reason, new RegExp(`${STAGING_SHA}.*not an ancestor`));
});

test("deploys when git could not diff staging's commit against the target", () => {
  const decision = decideDeploy({
    targetSha: TARGET_SHA,
    stagingVersion: STAGING_SHA,
    stagingIsAncestor: true,
    changedPaths: null,
  });

  assert.equal(decision.deploy, true);
  assert.match(decision.reason, new RegExp(`could not diff.*${STAGING_SHA}`));
});

test("deploys when a changed path is relevant to the cloud, naming the first one", () => {
  const decision = decideDeploy({
    targetSha: TARGET_SHA,
    stagingVersion: STAGING_SHA,
    stagingIsAncestor: true,
    changedPaths: ["README.md", "apps/cloud/src/server.ts", "packages/ui/src/button.tsx"],
  });

  assert.equal(decision.deploy, true);
  assert.match(decision.reason, /^apps\/cloud\/src\/server\.ts/);
});

test("skips when every changed path is irrelevant to the cloud", () => {
  const decision = decideDeploy({
    targetSha: TARGET_SHA,
    stagingVersion: STAGING_SHA,
    stagingIsAncestor: true,
    changedPaths: ["README.md", "apps/pos/src/register.ts"],
  });

  assert.equal(decision.deploy, false);
  assert.match(decision.reason, new RegExp(STAGING_SHA));
});

test("skips when staging already serves the target commit, with nothing changed", () => {
  const decision = decideDeploy({
    targetSha: STAGING_SHA,
    stagingVersion: STAGING_SHA,
    stagingIsAncestor: true,
    changedPaths: [],
  });

  assert.equal(decision.deploy, false);
});

// fetchStagingVersion ----------------------------------------------------------------

test("fetchStagingVersion reads the commit SHA out of a successful /health response", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ status: "ok", version: STAGING_SHA }));

  const version = await fetchStagingVersion({
    domain: "staging.purosur.online",
    fetchImpl,
    log: () => {},
  });

  assert.equal(version, STAGING_SHA);
});

test("fetchStagingVersion returns null when /health does not answer with status 200", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ status: "ok", version: STAGING_SHA }), { status: 503 });

  const version = await fetchStagingVersion({
    domain: "staging.purosur.online",
    fetchImpl,
    log: () => {},
  });

  assert.equal(version, null);
});

test("fetchStagingVersion returns null when the reported version is not a string", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ status: "ok", version: 42 }));

  const version = await fetchStagingVersion({
    domain: "staging.purosur.online",
    fetchImpl,
    log: () => {},
  });

  assert.equal(version, null);
});

// isAncestor --------------------------------------------------------------------------

test("isAncestor is true when git confirms the ancestry", async () => {
  const result = await isAncestor({
    ancestorSha: STAGING_SHA,
    targetSha: TARGET_SHA,
    runGit: async () => "",
  });

  assert.equal(result, true);
});

test("isAncestor is false when git reports the commit is not an ancestor", async () => {
  const result = await isAncestor({
    ancestorSha: STAGING_SHA,
    targetSha: TARGET_SHA,
    runGit: async () => {
      throw new Error("git merge-base --is-ancestor exited with status 1");
    },
  });

  assert.equal(result, false);
});

// diffChangedPaths ----------------------------------------------------------------------

test("diffChangedPaths lists the paths git reports as changed", async () => {
  const paths = await diffChangedPaths({
    fromSha: STAGING_SHA,
    toSha: TARGET_SHA,
    runGit: async () => "README.md\napps/cloud/src/server.ts\n",
  });

  assert.deepEqual(paths, ["README.md", "apps/cloud/src/server.ts"]);
});

test("diffChangedPaths returns an empty list when nothing changed", async () => {
  const paths = await diffChangedPaths({
    fromSha: STAGING_SHA,
    toSha: TARGET_SHA,
    runGit: async () => "",
  });

  assert.deepEqual(paths, []);
});

test("diffChangedPaths returns null when git could not produce the diff", async () => {
  const paths = await diffChangedPaths({
    fromSha: STAGING_SHA,
    toSha: TARGET_SHA,
    runGit: async () => {
      throw new Error("git diff exited with status 128");
    },
  });

  assert.equal(paths, null);
});

// runCli ----------------------------------------------------------------------------

function fakeCli({ env = {}, fetchResponse, gitBehavior = {} } = {}) {
  const calls = { git: [], fetch: 0, outputs: [], logs: [], errors: [] };
  const deps = {
    env: {
      CLOUD_HEALTH_DOMAIN: "staging.purosur.online",
      TARGET_SHA,
      GITHUB_OUTPUT: "/output",
      ...env,
    },
    runGit: async (args) => {
      calls.git.push(args);
      const [command] = args;
      if (gitBehavior[command] instanceof Error) {
        throw gitBehavior[command];
      }
      return gitBehavior[command] ?? "";
    },
    fetchImpl: async () => {
      calls.fetch += 1;
      return fetchResponse ?? new Response(JSON.stringify({ status: "ok", version: STAGING_SHA }));
    },
    appendOutput: async (path, line) => {
      calls.outputs.push({ path, line });
    },
    log: (message) => calls.logs.push(message),
    logError: (message) => calls.errors.push(message),
  };
  return { deps, calls };
}

test("fails before any IO when a required variable is missing", async () => {
  const { deps, calls } = fakeCli({ env: { CLOUD_HEALTH_DOMAIN: "" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 1);
  assert.equal(calls.fetch, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, []);
  assert.match(calls.errors.join("\n"), /CLOUD_HEALTH_DOMAIN/);
});

test("FORCE_DEPLOY deploys without any network or git call", async () => {
  const { deps, calls } = fakeCli({ env: { FORCE_DEPLOY: "true" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.equal(calls.fetch, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=true\n" }]);
});

test("deploys and skips git when staging's version is not a commit SHA", async () => {
  const { deps, calls } = fakeCli({
    fetchResponse: new Response(JSON.stringify({ status: "ok", version: "dev" })),
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=true\n" }]);
});

test("deploys and skips the diff when staging's commit is not an ancestor of the target", async () => {
  const { deps, calls } = fakeCli({
    gitBehavior: { "merge-base": new Error("not an ancestor") },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.git.map(([command]) => command),
    ["merge-base"],
  );
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=true\n" }]);
});

test("skips the deploy when staging is an ancestor and every changed path is irrelevant", async () => {
  const { deps, calls } = fakeCli({
    gitBehavior: { "merge-base": "", diff: "README.md\napps/pos/src/register.ts\n" },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.git.map(([command]) => command),
    ["merge-base", "diff"],
  );
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=false\n" }]);
});

test("deploys when staging is an ancestor but a changed path is relevant", async () => {
  const { deps, calls } = fakeCli({
    gitBehavior: { "merge-base": "", diff: "apps/cloud/src/server.ts\n" },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=true\n" }]);
});
