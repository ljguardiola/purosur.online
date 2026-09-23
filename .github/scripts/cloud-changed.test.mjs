import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideDeploy,
  diffChangedPaths,
  fetchPreviousRunVerdict,
  fetchStagingVersion,
  isAncestor,
  isIrrelevantToCloud,
  previousRunVerdict,
  runCli,
} from "./cloud-changed.mjs";

const STAGING_SHA = "a".repeat(40);
const TARGET_SHA = "b".repeat(40);

// isIrrelevantToCloud --------------------------------------------------------------

test("treats a register-app file as irrelevant", () => {
  assert.equal(isIrrelevantToCloud("apps/pos/src/register.ts"), true);
});

test("treats a markdown file outside the cloud's source roots as irrelevant", () => {
  assert.equal(isIrrelevantToCloud("drafts/odd/tasks/deploy-only-cloud-changes.md"), true);
});

test("treats a markdown file under the cloud app, the backoffice or a shared package as relevant", () => {
  assert.equal(isIrrelevantToCloud("apps/cloud/README.md"), false);
  assert.equal(isIrrelevantToCloud("apps/backoffice/src/help/intro.md"), false);
  assert.equal(isIrrelevantToCloud("packages/ui/src/components/notes.md"), false);
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

test("treats a helper nested at any depth under .github/scripts as relevant", () => {
  assert.equal(isIrrelevantToCloud(".github/scripts/lib/helper.mjs"), false);
});

test("treats a non-script data file under .github/scripts as relevant", () => {
  assert.equal(isIrrelevantToCloud(".github/scripts/lib/fixtures.json"), false);
});

test("treats a nested automation helper's own test file as irrelevant", () => {
  assert.equal(isIrrelevantToCloud(".github/scripts/lib/helper.test.mjs"), true);
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

// previousRunVerdict ------------------------------------------------------------------

const CURRENT_RUN_ID = 900;

function run(id, conclusion, createdAt, runStartedAt = createdAt) {
  return { id, conclusion, created_at: createdAt, run_started_at: runStartedAt };
}

test("judges an older run re-run after a newer one by its latest attempt", () => {
  const verdict = previousRunVerdict({
    body: {
      workflow_runs: [
        run(820, "success", "2026-09-01T12:00:00Z"),
        run(800, "failure", "2026-09-01T10:00:00Z", "2026-09-01T13:00:00Z"),
      ],
    },
    currentRunId: CURRENT_RUN_ID,
  });

  assert.equal(verdict.deploy, true);
  assert.match(verdict.reason, /800.*failure/);
});

test("lets staging's version decide when the previous run succeeded", () => {
  const verdict = previousRunVerdict({
    body: { workflow_runs: [run(800, "success", "2026-09-01T10:00:00Z")] },
    currentRunId: CURRENT_RUN_ID,
  });

  assert.equal(verdict.deploy, false);
});

test("looks past skipped runs to the last run that did something", () => {
  const verdict = previousRunVerdict({
    body: {
      workflow_runs: [
        run(810, "skipped", "2026-09-01T11:00:00Z"),
        run(800, "failure", "2026-09-01T10:00:00Z"),
      ],
    },
    currentRunId: CURRENT_RUN_ID,
  });

  assert.equal(verdict.deploy, true);
  assert.match(verdict.reason, /800.*failure/);
});

test("deploys when every previous run was skipped", () => {
  const verdict = previousRunVerdict({
    body: { workflow_runs: [run(810, "skipped", "2026-09-01T11:00:00Z")] },
    currentRunId: CURRENT_RUN_ID,
  });

  assert.equal(verdict.deploy, true);
});

test("deploys when the previous run did not end well, naming that run", () => {
  for (const conclusion of ["failure", "cancelled", "timed_out"]) {
    const verdict = previousRunVerdict({
      body: { workflow_runs: [run(800, conclusion, "2026-09-01T10:00:00Z")] },
      currentRunId: CURRENT_RUN_ID,
    });

    assert.equal(verdict.deploy, true);
    assert.match(verdict.reason, new RegExp(`800.*${conclusion}`));
  }
});

test("judges the most recently started run, whatever the listing order", () => {
  const verdict = previousRunVerdict({
    body: {
      workflow_runs: [
        run(700, "success", "2026-09-01T09:00:00Z"),
        run(800, "cancelled", "2026-09-01T10:00:00Z"),
        run(600, "success", "2026-09-01T08:00:00Z"),
      ],
    },
    currentRunId: CURRENT_RUN_ID,
  });

  assert.equal(verdict.deploy, true);
  assert.match(verdict.reason, /800/);
});

test("ignores the current run when looking for the previous one", () => {
  const verdict = previousRunVerdict({
    body: {
      workflow_runs: [
        run(CURRENT_RUN_ID, "success", "2026-09-01T11:00:00Z"),
        run(800, "failure", "2026-09-01T10:00:00Z"),
      ],
    },
    currentRunId: CURRENT_RUN_ID,
  });

  assert.equal(verdict.deploy, true);
  assert.match(verdict.reason, /800/);
});

test("deploys when there is no previous completed run", () => {
  const verdict = previousRunVerdict({
    body: { workflow_runs: [] },
    currentRunId: CURRENT_RUN_ID,
  });

  assert.equal(verdict.deploy, true);
});

// fetchPreviousRunVerdict --------------------------------------------------------------

test("fetchPreviousRunVerdict lists this workflow's completed runs with the token", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return new Response(
      JSON.stringify({ workflow_runs: [run(800, "success", "2026-09-01T10:00:00Z")] }),
    );
  };

  const verdict = await fetchPreviousRunVerdict({
    repository: "owner/repo",
    token: "secret",
    currentRunId: CURRENT_RUN_ID,
    fetchImpl,
  });

  assert.equal(verdict.deploy, false);
  const url = new URL(requests[0].url);
  assert.equal(url.pathname, "/repos/owner/repo/actions/workflows/deploy-cloud-staging.yml/runs");
  assert.equal(url.searchParams.get("status"), "completed");
  assert.equal(url.searchParams.get("per_page"), "30");
  assert.equal(requests[0].init.headers.Authorization, "Bearer secret");
  assert.ok(requests[0].init.signal instanceof AbortSignal);
});

test("fetchPreviousRunVerdict deploys when the runs listing answers with an error status", async () => {
  const verdict = await fetchPreviousRunVerdict({
    repository: "owner/repo",
    token: "secret",
    currentRunId: CURRENT_RUN_ID,
    fetchImpl: async () => new Response("{}", { status: 403 }),
  });

  assert.equal(verdict.deploy, true);
  assert.match(verdict.reason, /403/);
});

test("fetchPreviousRunVerdict deploys when the runs listing cannot be reached", async () => {
  const verdict = await fetchPreviousRunVerdict({
    repository: "owner/repo",
    token: "secret",
    currentRunId: CURRENT_RUN_ID,
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
  });

  assert.equal(verdict.deploy, true);
  assert.match(verdict.reason, /fetch failed/);
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

test("fetchStagingVersion returns null when staging cannot be reached", async () => {
  const fetchImpl = async () => {
    throw new TypeError("fetch failed");
  };

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

test("diffChangedPaths lists both ends of a move instead of collapsing it into a rename", async () => {
  const requested = [];
  await diffChangedPaths({
    fromSha: STAGING_SHA,
    toSha: TARGET_SHA,
    runGit: async (args) => {
      requested.push(args);
      return "";
    },
  });

  assert.ok(requested[0].includes("--no-renames"));
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

const SUCCESSFUL_PREVIOUS_RUN = { workflow_runs: [run(800, "success", "2026-09-01T10:00:00Z")] };

function fakeCli({ env = {}, fetchResponse, runsResponse, gitBehavior = {} } = {}) {
  const calls = { git: [], fetch: 0, runsListings: 0, outputs: [], logs: [], errors: [] };
  const deps = {
    env: {
      CLOUD_HEALTH_DOMAIN: "staging.purosur.online",
      TARGET_SHA,
      GITHUB_OUTPUT: "/output",
      GITHUB_TOKEN: "secret",
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_RUN_ID: String(CURRENT_RUN_ID),
      RUN_ATTEMPT: "1",
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
    fetchImpl: async (url) => {
      if (new URL(url).hostname === "api.github.com") {
        calls.runsListings += 1;
        if (runsResponse instanceof Error) {
          throw runsResponse;
        }
        return runsResponse ?? new Response(JSON.stringify(SUCCESSFUL_PREVIOUS_RUN));
      }
      calls.fetch += 1;
      if (fetchResponse instanceof Error) {
        throw fetchResponse;
      }
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
  assert.equal(calls.runsListings, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, []);
  assert.match(calls.errors.join("\n"), /CLOUD_HEALTH_DOMAIN/);
});

test("fails before any IO when the GitHub API variables are missing", async () => {
  const { deps, calls } = fakeCli({ env: { GITHUB_RUN_ID: "" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 1);
  assert.equal(calls.runsListings, 0);
  assert.deepEqual(calls.outputs, []);
  assert.match(calls.errors.join("\n"), /GITHUB_RUN_ID/);
});

test("FORCE_DEPLOY deploys without any network or git call", async () => {
  const { deps, calls } = fakeCli({ env: { FORCE_DEPLOY: "true" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.runsListings, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=true\n" }]);
});

test("a re-run deploys without any network or git call", async () => {
  const { deps, calls } = fakeCli({ env: { RUN_ATTEMPT: "2" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.runsListings, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=true\n" }]);
  assert.match(calls.logs.join("\n"), /attempt 2/);
});

test("deploys without asking staging when the previous run did not succeed", async () => {
  const { deps, calls } = fakeCli({
    runsResponse: new Response(
      JSON.stringify({ workflow_runs: [run(800, "failure", "2026-09-01T10:00:00Z")] }),
    ),
    gitBehavior: { "merge-base": "", diff: "README.md\n" },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.equal(calls.fetch, 0);
  assert.deepEqual(calls.git, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=true\n" }]);
  assert.match(calls.logs.join("\n"), /800/);
});

test("deploys when the previous run cannot be looked up", async () => {
  const { deps, calls } = fakeCli({
    runsResponse: new TypeError("fetch failed"),
    gitBehavior: { "merge-base": "", diff: "README.md\n" },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "deploy=true\n" }]);
});

test("deploys and skips git when staging cannot be reached", async () => {
  const { deps, calls } = fakeCli({ fetchResponse: new TypeError("fetch failed") });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.equal(calls.fetch, 1);
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
