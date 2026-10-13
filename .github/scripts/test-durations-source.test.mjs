import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decodeDurations } from "./test-durations.mjs";
import { downloadDurations, findRunWithDurations, runCli } from "./test-durations-source.mjs";

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ownRepository = { full_name: "owner/repo" };

function artifact(name, expired = false) {
  return { name, expired };
}

function durationsOfRun(runId) {
  return { [`node:measured-on-run-${runId}.test.ts`]: runId };
}

function handedDurations(calls) {
  assert.equal(calls.outputs.length, 1);
  assert.equal(calls.outputs[0].path, "/output");
  const match = calls.outputs[0].line.match(/^durations=(.*)\n$/);
  assert.ok(match, calls.outputs[0].line);
  return decodeDurations(match[1]);
}

function fakeCli({
  runs = [{ id: 3 }, { id: 2 }, { id: 1 }],
  runsByBranch = {},
  artifactsByRun = {},
  failOn,
  env = {},
} = {}) {
  const calls = { fetch: [], downloads: [], outputs: [], logs: [], errors: [] };
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
      const branch = new URL(url).searchParams.get("branch");
      return jsonResponse({ workflow_runs: runsByBranch[branch] ?? runs });
    },
    download: async (runId) => {
      calls.downloads.push(runId);
      return durationsOfRun(runId);
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
  assert.deepEqual(handedDurations(calls), durationsOfRun(1));
});

test("stops looking at the first run that qualifies", async () => {
  const { deps, calls } = fakeCli({
    artifactsByRun: {
      3: [artifact("test-durations-shard-1")],
      2: [artifact("test-durations-shard-1")],
    },
  });

  await runCli(deps);

  assert.deepEqual(handedDurations(calls), durationsOfRun(3));
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

test("hands the shards no durations when no run kept the artifact", async () => {
  const { deps, calls } = fakeCli();

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(handedDurations(calls), {});
});

test("warns and hands the shards no durations when the API answers an error", async () => {
  const { deps, calls } = fakeCli({ failOn: () => jsonResponse({}, 500) });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(handedDurations(calls), {});
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /500/);
});

test("warns and hands the shards no durations when the request itself fails", async () => {
  const { deps, calls } = fakeCli();
  deps.fetchImpl = async () => {
    throw new Error("network down");
  };

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(handedDurations(calls), {});
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

test("on a pull request, also lists successful pull_request runs of its own head branch", async () => {
  const { deps, calls } = fakeCli({ env: { HEAD_BRANCH: "ci/1-some-work" } });

  await runCli(deps);

  const runLists = calls.fetch
    .map((f) => new URL(f.url))
    .filter((url) => url.pathname.endsWith("/workflows/verify.yml/runs"));
  const branchList = runLists.find((url) => url.searchParams.get("branch") === "ci/1-some-work");
  assert.equal(branchList.searchParams.get("event"), "pull_request");
  assert.equal(branchList.searchParams.get("status"), "success");
  assert.ok(runLists.some((url) => url.searchParams.get("branch") === "main"));
});

test("without a head branch lists only main's runs", async () => {
  const { deps, calls } = fakeCli();

  await runCli(deps);

  const branches = calls.fetch
    .map((f) => new URL(f.url))
    .filter((url) => url.pathname.endsWith("/workflows/verify.yml/runs"))
    .map((url) => url.searchParams.get("branch"));
  assert.deepEqual(branches, ["main"]);
});

for (const [newer, expected] of [
  ["head branch", 20],
  ["main", 10],
]) {
  test(`takes the newer qualifying run when the ${newer}'s is newer`, async () => {
    const mainCreated = newer === "main" ? "2026-01-02T00:00:00Z" : "2026-01-01T00:00:00Z";
    const branchCreated = newer === "main" ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z";
    const { deps, calls } = fakeCli({
      env: { HEAD_BRANCH: "ci/1-some-work" },
      runsByBranch: {
        main: [{ id: 10, created_at: mainCreated }],
        "ci/1-some-work": [{ id: 20, created_at: branchCreated, head_repository: ownRepository }],
      },
      artifactsByRun: {
        10: [artifact("test-durations-shard-1")],
        20: [artifact("test-durations-shard-1")],
      },
    });

    await runCli(deps);

    assert.deepEqual(handedDurations(calls), durationsOfRun(expected));
  });
}

test("takes main's run when the head branch has none that qualifies", async () => {
  const { deps, calls } = fakeCli({
    env: { HEAD_BRANCH: "ci/1-some-work" },
    runsByBranch: {
      main: [{ id: 10, created_at: "2026-01-01T00:00:00Z" }],
      "ci/1-some-work": [
        { id: 20, created_at: "2026-01-02T00:00:00Z", head_repository: ownRepository },
      ],
    },
    artifactsByRun: { 10: [artifact("test-durations-shard-1")] },
  });

  await runCli(deps);

  assert.deepEqual(handedDurations(calls), durationsOfRun(10));
});

test("never takes a run of a same-named branch from another repository", async () => {
  const { deps, calls } = fakeCli({
    env: { HEAD_BRANCH: "ci/1-some-work" },
    runsByBranch: {
      main: [{ id: 10, created_at: "2026-01-01T00:00:00Z" }],
      "ci/1-some-work": [
        {
          id: 30,
          created_at: "2026-01-03T00:00:00Z",
          head_repository: { full_name: "someone/repo" },
        },
        { id: 20, created_at: "2026-01-02T00:00:00Z", head_repository: ownRepository },
      ],
    },
    artifactsByRun: {
      10: [artifact("test-durations-shard-1")],
      20: [artifact("test-durations-shard-1")],
      30: [artifact("test-durations-shard-1")],
    },
  });

  await runCli(deps);

  assert.deepEqual(handedDurations(calls), durationsOfRun(20));
  assert.ok(!calls.fetch.some((f) => f.url.includes("runs/30/artifacts")));
});

test("hands every shard the durations it downloaded from the run it picked, once", async () => {
  const { deps, calls } = fakeCli({ artifactsByRun: { 2: [artifact("test-durations-shard-1")] } });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.downloads, [2]);
  assert.deepEqual(handedDurations(calls), durationsOfRun(2));
  assert.match(calls.logs.at(-1), /run 2/);
});

test("does not download when no run kept the artifact", async () => {
  const { deps, calls } = fakeCli();

  await runCli(deps);

  assert.deepEqual(calls.downloads, []);
});

test("warns and hands the shards no durations when the download fails", async () => {
  const { deps, calls } = fakeCli({ artifactsByRun: { 2: [artifact("test-durations-shard-1")] } });
  deps.download = async () => {
    throw new Error("HTTP 503: 503 Egress is over the account limit");
  };

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(handedDurations(calls), {});
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /split by file count/);
  assert.match(calls.errors[0], /Egress is over the account limit/);
});

test("warns and hands the shards no durations when they are too large to hand over", async () => {
  const { deps, calls } = fakeCli({ artifactsByRun: { 2: [artifact("test-durations-shard-1")] } });
  deps.download = async () =>
    Object.fromEntries(
      Array.from({ length: 8000 }, (_, i) => [
        `node:${createHash("sha256").update(String(i)).digest("hex")}.test.ts`,
        i,
      ]),
    );

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(handedDurations(calls), {});
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /too large/);
});

async function inScratchDir(body) {
  const dir = await mkdtemp(join(tmpdir(), "test-durations-source-"));
  try {
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeGh(onRun) {
  const runs = [];
  const execFileImpl = async (file, args, options) => {
    runs.push({ file, args, options });
    await onRun(args[args.indexOf("--dir") + 1]);
    return { stdout: "", stderr: "" };
  };
  return { runs, execFileImpl };
}

test("downloads every shard's durations of a run with gh and merges them", async () => {
  await inScratchDir(async (dir) => {
    const { runs, execFileImpl } = fakeGh(async (into) => {
      for (const [shard, durations] of [
        [1, { "node:a.test.ts": 10 }],
        [2, { "browser:b.test.tsx": 20 }],
      ]) {
        await mkdir(join(into, `test-durations-shard-${shard}`), { recursive: true });
        await writeFile(
          join(into, `test-durations-shard-${shard}`, `shard-${shard}.json`),
          JSON.stringify(durations),
        );
      }
    });

    const durations = await downloadDurations(7, {
      repository: "owner/repo",
      token: "token",
      dir,
      execFileImpl,
    });

    assert.deepEqual(durations, { "node:a.test.ts": 10, "browser:b.test.tsx": 20 });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].file, "gh");
    assert.deepEqual(runs[0].args.slice(0, 3), ["run", "download", "7"]);
    assert.equal(runs[0].args[runs[0].args.indexOf("--repo") + 1], "owner/repo");
    assert.equal(runs[0].args[runs[0].args.indexOf("--pattern") + 1], "test-durations-shard-*");
    assert.equal(runs[0].options.env.GH_TOKEN, "token");
  });
});

test("fails the download when gh fails, even after some shards arrived", async () => {
  await inScratchDir(async (dir) => {
    const { execFileImpl } = fakeGh(async (into) => {
      await mkdir(join(into, "test-durations-shard-1"), { recursive: true });
      await writeFile(join(into, "test-durations-shard-1", "shard-1.json"), '{"node:a":1}');
      throw new Error("error downloading test-durations-shard-2: HTTP 503");
    });

    await assert.rejects(
      downloadDurations(7, { repository: "owner/repo", token: "token", dir, execFileImpl }),
      /HTTP 503/,
    );
  });
});
