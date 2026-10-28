import assert from "node:assert/strict";
import { test } from "node:test";
import { decideSkipAllowed, fetchPreviousCommitRuns, runCli } from "./previous-commit-verified.mjs";

const PREVIOUS = "b".repeat(40);
const OTHER = "c".repeat(40);
const NULL_SHA = "0".repeat(40);

function run({
  id = 1,
  sha = PREVIOUS,
  status = "completed",
  conclusion = "success",
  event = "push",
  branch = "main",
  createdAt = "2026-10-28T10:00:00Z",
} = {}) {
  return {
    id,
    head_sha: sha,
    status,
    conclusion,
    event,
    head_branch: branch,
    created_at: createdAt,
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeCli({ runs = [], env = {}, fetchImpl } = {}) {
  const calls = { fetch: [], outputs: [], logs: [], errors: [] };
  const deps = {
    env: {
      EVENT_NAME: "push",
      PREVIOUS_SHA: PREVIOUS,
      GITHUB_TOKEN: "token",
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_OUTPUT: "/output",
      ...env,
    },
    fetchImpl:
      fetchImpl ??
      (async (url, options) => {
        calls.fetch.push({ url, options });
        return jsonResponse({ workflow_runs: runs });
      }),
    appendOutput: async (path, line) => {
      calls.outputs.push({ path, line });
    },
    log: (message) => calls.logs.push(message),
    logError: (message) => calls.errors.push(message),
  };
  return { deps, calls };
}

test("allows skipping on a pull request without asking about any previous commit", () => {
  const decision = decideSkipAllowed({ eventName: "pull_request", previousSha: "", runs: null });

  assert.equal(decision.skipAllowed, true);
});

test("allows skipping on a push when the previous commit's Verify run succeeded", () => {
  const decision = decideSkipAllowed({ eventName: "push", previousSha: PREVIOUS, runs: [run()] });

  assert.equal(decision.skipAllowed, true);
  assert.match(decision.reason, new RegExp(PREVIOUS));
});

for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "action_required"]) {
  test(`runs in full on a push when the previous commit's Verify run concluded ${conclusion}`, () => {
    const decision = decideSkipAllowed({
      eventName: "push",
      previousSha: PREVIOUS,
      runs: [run({ conclusion })],
    });

    assert.equal(decision.skipAllowed, false);
    assert.match(decision.reason, new RegExp(conclusion));
  });
}

for (const status of ["queued", "in_progress", "waiting", "pending"]) {
  test(`runs in full on a push when the previous commit's Verify run is still ${status}`, () => {
    const decision = decideSkipAllowed({
      eventName: "push",
      previousSha: PREVIOUS,
      runs: [run({ status, conclusion: null })],
    });

    assert.equal(decision.skipAllowed, false);
    assert.match(decision.reason, /not finished/);
  });
}

test("runs in full on a push when the previous commit has no Verify run", () => {
  const decision = decideSkipAllowed({ eventName: "push", previousSha: PREVIOUS, runs: [] });

  assert.equal(decision.skipAllowed, false);
  assert.match(decision.reason, /no Verify run/);
});

test("runs in full on a push when the runs could not be read", () => {
  const decision = decideSkipAllowed({ eventName: "push", previousSha: PREVIOUS, runs: null });

  assert.equal(decision.skipAllowed, false);
});

for (const previousSha of ["", undefined, NULL_SHA]) {
  test(`runs in full on a push whose previous commit is ${JSON.stringify(previousSha)}`, () => {
    const decision = decideSkipAllowed({ eventName: "push", previousSha, runs: [run()] });

    assert.equal(decision.skipAllowed, false);
  });
}

test("runs in full for an event that is neither a pull request nor a push", () => {
  const decision = decideSkipAllowed({
    eventName: "workflow_dispatch",
    previousSha: PREVIOUS,
    runs: [run()],
  });

  assert.equal(decision.skipAllowed, false);
});

test("judges the previous commit by its newest Verify run, not an older green one", () => {
  const decision = decideSkipAllowed({
    eventName: "push",
    previousSha: PREVIOUS,
    runs: [
      run({ id: 1, createdAt: "2026-10-28T10:00:00Z" }),
      run({ id: 2, conclusion: "failure", createdAt: "2026-10-28T11:00:00Z" }),
    ],
  });

  assert.equal(decision.skipAllowed, false);
});

test("allows skipping when the newest Verify run of the previous commit succeeded after an older failure", () => {
  const decision = decideSkipAllowed({
    eventName: "push",
    previousSha: PREVIOUS,
    runs: [
      run({ id: 2, createdAt: "2026-10-28T11:00:00Z" }),
      run({ id: 1, conclusion: "failure", createdAt: "2026-10-28T10:00:00Z" }),
    ],
  });

  assert.equal(decision.skipAllowed, true);
});

test("ignores runs of another commit, another event or another branch", () => {
  const decision = decideSkipAllowed({
    eventName: "push",
    previousSha: PREVIOUS,
    runs: [
      run({ sha: OTHER }),
      run({ event: "pull_request" }),
      run({ branch: "feat/1-other" }),
    ],
  });

  assert.equal(decision.skipAllowed, false);
  assert.match(decision.reason, /no Verify run/);
});

test("asks GitHub for the push runs of Verify on main for the previous commit, authenticated", async () => {
  const requests = [];
  const runs = await fetchPreviousCommitRuns({
    repository: "owner/repo",
    token: "secret",
    previousSha: PREVIOUS,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ workflow_runs: [run()] });
    },
  });

  assert.equal(requests.length, 1);
  const url = new URL(requests[0].url);
  assert.equal(url.origin, "https://api.github.com");
  assert.equal(url.pathname, "/repos/owner/repo/actions/workflows/verify.yml/runs");
  assert.equal(url.searchParams.get("head_sha"), PREVIOUS);
  assert.equal(url.searchParams.get("branch"), "main");
  assert.equal(url.searchParams.get("event"), "push");
  assert.equal(url.searchParams.get("status"), null);
  assert.equal(requests[0].options.headers.Authorization, "Bearer secret");
  assert.deepEqual(runs, [run()]);
});

test("fails when GitHub answers the runs request with an error status", async () => {
  await assert.rejects(
    fetchPreviousCommitRuns({
      repository: "owner/repo",
      token: "secret",
      previousSha: PREVIOUS,
      fetchImpl: async () => jsonResponse({ message: "Bad credentials" }, 401),
    }),
    /401/,
  );
});

test("fails when GitHub's answer has no run list", async () => {
  await assert.rejects(
    fetchPreviousCommitRuns({
      repository: "owner/repo",
      token: "secret",
      previousSha: PREVIOUS,
      fetchImpl: async () => jsonResponse({ message: "Not Found" }),
    }),
    /run list/,
  );
});

test("writes skip_allowed=true when the previous commit passed Verify", async () => {
  const { deps, calls } = fakeCli({ runs: [run()] });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "skip_allowed=true\n" }]);
});

test("writes skip_allowed=false when the previous commit's Verify run failed", async () => {
  const { deps, calls } = fakeCli({ runs: [run({ conclusion: "failure" })] });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "skip_allowed=false\n" }]);
  assert.match(calls.logs.join("\n"), /failure/);
});

test("writes skip_allowed=false and still succeeds when GitHub cannot be asked", async () => {
  const { deps, calls } = fakeCli({
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "skip_allowed=false\n" }]);
  assert.match(calls.errors.join("\n"), /network down/);
});

test("writes skip_allowed=true on a pull request without asking GitHub", async () => {
  const { deps, calls } = fakeCli({
    env: { EVENT_NAME: "pull_request", PREVIOUS_SHA: "", GITHUB_TOKEN: "" },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.fetch, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "skip_allowed=true\n" }]);
});

test("writes skip_allowed=false on a push without a previous commit, without asking GitHub", async () => {
  const { deps, calls } = fakeCli({ env: { PREVIOUS_SHA: NULL_SHA } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.fetch, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "skip_allowed=false\n" }]);
});

test("writes skip_allowed=false on a push when the token or repository is missing", async () => {
  const { deps, calls } = fakeCli({ env: { GITHUB_TOKEN: "" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.fetch, []);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "skip_allowed=false\n" }]);
  assert.match(calls.errors.join("\n"), /GITHUB_TOKEN/);
});

test("fails when there is no step output to write to", async () => {
  const { deps, calls } = fakeCli({ env: { GITHUB_OUTPUT: "" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.outputs, []);
});
