import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchVerifiedShas,
  newestVerifiedCommit,
  readFirstParentHistory,
  runCli,
  verifiedShasFromRuns,
} from "./newest-verified-commit.mjs";

const NEWEST = "c".repeat(40);
const MIDDLE = "b".repeat(40);
const OLDEST = "a".repeat(40);
const HISTORY = [NEWEST, MIDDLE, OLDEST];

function run({ sha, conclusion = "success", event = "push" }) {
  return { head_sha: sha, conclusion, event };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeCli({ history = HISTORY, runs = [], env = {} } = {}) {
  const calls = { git: [], fetch: [], outputs: [], logs: [], errors: [] };
  const deps = {
    env: {
      GITHUB_TOKEN: "token",
      GITHUB_REPOSITORY: "owner/repo",
      TRIGGERING_SHA: OLDEST,
      GITHUB_OUTPUT: "/output",
      ...env,
    },
    runGit: async (args) => {
      calls.git.push(args);
      return `${history.join("\n")}\n`;
    },
    fetchImpl: async (url, options) => {
      calls.fetch.push({ url, options });
      return jsonResponse({ workflow_runs: runs });
    },
    appendOutput: async (path, line) => {
      calls.outputs.push({ path, line });
    },
    log: (message) => calls.logs.push(message),
    logError: (message) => calls.errors.push(message),
  };
  return { deps, calls };
}

// newestVerifiedCommit ------------------------------------------------------------

test("picks the newest commit in history that passed verification", () => {
  const sha = newestVerifiedCommit({
    history: HISTORY,
    verifiedShas: new Set([OLDEST, MIDDLE]),
  });

  assert.equal(sha, MIDDLE);
});

test("skips newer commits whose verification has not passed", () => {
  const sha = newestVerifiedCommit({ history: HISTORY, verifiedShas: new Set([OLDEST]) });

  assert.equal(sha, OLDEST);
});

test("ignores verified commits that are not in history", () => {
  const sha = newestVerifiedCommit({ history: [NEWEST, MIDDLE], verifiedShas: new Set([OLDEST]) });

  assert.equal(sha, null);
});

test("returns null when no commit in history passed verification", () => {
  assert.equal(newestVerifiedCommit({ history: HISTORY, verifiedShas: new Set() }), null);
});

// verifiedShasFromRuns --------------------------------------------------------------

test("collects the head commit of every successful push run", () => {
  const shas = verifiedShasFromRuns({
    workflow_runs: [run({ sha: NEWEST }), run({ sha: OLDEST })],
  });

  assert.deepEqual(shas, new Set([NEWEST, OLDEST]));
});

test("leaves out runs that did not succeed or were not triggered by a push", () => {
  const shas = verifiedShasFromRuns({
    workflow_runs: [
      run({ sha: NEWEST, conclusion: "failure" }),
      run({ sha: MIDDLE, event: "pull_request" }),
      run({ sha: OLDEST }),
    ],
  });

  assert.deepEqual(shas, new Set([OLDEST]));
});

test("returns an empty set when there are no runs", () => {
  assert.deepEqual(verifiedShasFromRuns({ workflow_runs: [] }), new Set());
});

test("returns an empty set when the response has no run list", () => {
  assert.deepEqual(verifiedShasFromRuns({ message: "Not Found" }), new Set());
});

// readFirstParentHistory ------------------------------------------------------------

test("reads the first-parent history of the ref, newest first", async () => {
  const seen = [];
  const history = await readFirstParentHistory("HEAD", async (args) => {
    seen.push(args);
    return `${NEWEST}\n${MIDDLE}\n`;
  });

  assert.deepEqual(seen, [["rev-list", "--first-parent", "HEAD"]]);
  assert.deepEqual(history, [NEWEST, MIDDLE]);
});

// fetchVerifiedShas -----------------------------------------------------------------

test("asks GitHub for successful push runs of Verify on main, authenticated", async () => {
  const requests = [];
  const shas = await fetchVerifiedShas({
    repository: "owner/repo",
    token: "secret",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ workflow_runs: [run({ sha: MIDDLE })] });
    },
  });

  assert.equal(requests.length, 1);
  const url = new URL(requests[0].url);
  assert.equal(url.origin, "https://api.github.com");
  assert.equal(url.pathname, "/repos/owner/repo/actions/workflows/verify.yml/runs");
  assert.equal(url.searchParams.get("branch"), "main");
  assert.equal(url.searchParams.get("event"), "push");
  assert.equal(url.searchParams.get("status"), "success");
  assert.equal(url.searchParams.get("per_page"), "100");
  assert.equal(requests[0].options.headers.Authorization, "Bearer secret");
  assert.deepEqual(shas, new Set([MIDDLE]));
});

test("fails when GitHub answers the runs request with an error status", async () => {
  await assert.rejects(
    fetchVerifiedShas({
      repository: "owner/repo",
      token: "secret",
      fetchImpl: async () => jsonResponse({ message: "Bad credentials" }, 401),
    }),
    /401/,
  );
});

// runCli ----------------------------------------------------------------------------

test("writes the newest verified commit to the step output", async () => {
  const { deps, calls } = fakeCli({ runs: [run({ sha: MIDDLE })] });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: `sha=${MIDDLE}\n` }]);
  assert.match(calls.logs.join("\n"), new RegExp(`${MIDDLE}.*triggered by ${OLDEST}`));
});

test("counts the triggering commit as verified even when GitHub does not list it yet", async () => {
  const { deps, calls } = fakeCli({
    runs: [run({ sha: OLDEST })],
    env: { TRIGGERING_SHA: NEWEST },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: `sha=${NEWEST}\n` }]);
});

test("fails without writing an output when no commit in history passed verification", async () => {
  const { deps, calls } = fakeCli({
    history: [NEWEST, MIDDLE],
    runs: [],
    env: { TRIGGERING_SHA: OLDEST },
  });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.outputs, []);
  assert.match(calls.errors.join("\n"), /no commit .* passed verification/i);
});

test("fails before any request when a required variable is missing", async () => {
  const { deps, calls } = fakeCli({ env: { GITHUB_TOKEN: "" } });

  const exitCode = await runCli(deps);

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.fetch, []);
  assert.deepEqual(calls.git, []);
  assert.match(calls.errors.join("\n"), /GITHUB_TOKEN/);
});
