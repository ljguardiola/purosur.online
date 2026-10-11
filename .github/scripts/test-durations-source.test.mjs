import assert from "node:assert/strict";
import { test } from "node:test";
import { findRunWithDurations, runCli } from "./test-durations-source.mjs";

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function artifact(name, expired = false) {
  return { name, expired };
}

function fakeCli({
  runs = [{ id: 3 }, { id: 2 }, { id: 1 }],
  artifactsByRun = {},
  failOn,
  env = {},
} = {}) {
  const calls = { fetch: [], outputs: [], logs: [], errors: [] };
  const deps = {
    env: {
      GITHUB_TOKEN: "token",
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_OUTPUT: "/output",
      ...env,
    },
    fetchImpl: async (url, options) => {
      calls.fetch.push({ url, options });
      if (failOn?.(url)) return failOn(url);
      if (url.includes("/artifacts")) {
        const id = Number(url.match(/runs\/(\d+)\/artifacts/)[1]);
        return jsonResponse({ artifacts: artifactsByRun[id] ?? [] });
      }
      return jsonResponse({ workflow_runs: runs });
    },
    appendOutput: async (path, line) => calls.outputs.push({ path, line }),
    log: (message) => calls.logs.push(message),
    logError: (message) => calls.errors.push(message),
  };
  return { deps, calls };
}

test("picks the newest run that kept a durations artifact", async () => {
  const { deps, calls } = fakeCli({
    artifactsByRun: {
      3: [artifact("catalog-visual-diff")],
      2: [artifact("test-durations-shard-1", true)],
      1: [artifact("test-durations-shard-2")],
    },
  });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "run_id=1\n" }]);
});

test("stops looking at the first run that qualifies", async () => {
  const { deps, calls } = fakeCli({
    artifactsByRun: {
      3: [artifact("test-durations-shard-1")],
      2: [artifact("test-durations-shard-1")],
    },
  });

  await runCli(deps);

  assert.deepEqual(calls.outputs, [{ path: "/output", line: "run_id=3\n" }]);
  assert.ok(!calls.fetch.some((f) => f.url.includes("runs/2/artifacts")));
});

test("lists successful push runs of Verify on main, newest first", async () => {
  const { deps, calls } = fakeCli();

  await runCli(deps);

  const url = new URL(calls.fetch[0].url);
  assert.equal(url.pathname, "/repos/owner/repo/actions/workflows/verify.yml/runs");
  assert.equal(url.searchParams.get("branch"), "main");
  assert.equal(url.searchParams.get("event"), "push");
  assert.equal(url.searchParams.get("status"), "success");
  assert.equal(url.searchParams.get("per_page"), "10");
  assert.equal(calls.fetch[0].options.headers.Authorization, "Bearer token");
});

test("writes an empty run id when no run kept the artifact", async () => {
  const { deps, calls } = fakeCli();

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "run_id=\n" }]);
});

test("warns and writes an empty run id when the API answers an error", async () => {
  const { deps, calls } = fakeCli({ failOn: () => jsonResponse({}, 500) });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "run_id=\n" }]);
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /500/);
});

test("warns and writes an empty run id when the request itself fails", async () => {
  const { deps, calls } = fakeCli();
  deps.fetchImpl = async () => {
    throw new Error("network down");
  };

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.outputs, [{ path: "/output", line: "run_id=\n" }]);
  assert.match(calls.errors[0], /network down/);
});

test("fails when the environment is incomplete", async () => {
  const { deps, calls } = fakeCli({ env: { GITHUB_TOKEN: "" } });

  assert.equal(await runCli(deps), 1);
  assert.deepEqual(calls.outputs, []);
});

test("finds the first run with a live durations artifact", async () => {
  const id = await findRunWithDurations({
    runs: [{ id: 5 }, { id: 4 }],
    listArtifacts: async (runId) => (runId === 4 ? [artifact("test-durations-shard-3")] : []),
  });

  assert.equal(id, 4);
});
