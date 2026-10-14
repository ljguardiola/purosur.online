import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { DEPLOYMENT_LIST_LIMIT, decideBaseline, runCli } from "./production-baseline.mjs";
import { runCli as runRegisterMinimumCheck } from "./register-minimum-check.mjs";

const PREFIX = "cloud-v";
const SERVED_SHA = "c".repeat(40);
const REGISTER_VERSION_PATH = "packages/domain/src/sync/model/register-version.ts";

const DEPLOYED = { deployments: [{ id: "d1", status: "SUCCESS" }], error: null };

function healthy(version) {
  return { status: 200, body: { status: "ok", version } };
}

test("production with no deployment yet has no baseline release", () => {
  const decision = decideBaseline({
    deploymentList: { deployments: [], error: null },
    prefix: PREFIX,
  });

  assert.equal(decision.refused, false);
  assert.equal(decision.tag, null);
});

test("production whose every deployment failed or was skipped has never served, so it has no baseline release", () => {
  const decision = decideBaseline({
    deploymentList: {
      deployments: [
        { id: "d2", status: "SKIPPED" },
        { id: "d1", status: "FAILED" },
      ],
      error: null,
    },
    health: null,
    prefix: PREFIX,
  });

  assert.equal(decision.refused, false);
  assert.equal(decision.tag, null);
});

test("refuses when a deployment may have served and production's health does not answer", () => {
  for (const status of ["CRASHED", "REMOVED", "REMOVING", "SUCCESS", "BUILDING", "SOMETHING_NEW"]) {
    const decision = decideBaseline({
      deploymentList: {
        deployments: [
          { id: "d2", status: "FAILED" },
          { id: "d1", status },
        ],
        error: null,
      },
      health: null,
      prefix: PREFIX,
    });

    assert.equal(decision.refused, true, status);
  }
});

test("refuses when the list is as long as Railway returns, so an older deployment may have served", () => {
  const decision = decideBaseline({
    deploymentList: {
      deployments: Array.from({ length: DEPLOYMENT_LIST_LIMIT }, (_, index) => ({
        id: `d${index}`,
        status: "FAILED",
      })),
      error: null,
    },
    health: null,
    prefix: PREFIX,
  });

  assert.equal(decision.refused, true);
});

test("the baseline is the release tag on the commit production reports", () => {
  const decision = decideBaseline({
    deploymentList: DEPLOYED,
    health: healthy(SERVED_SHA),
    tagsAtVersion: ["cloud-v1.0.0"],
    prefix: PREFIX,
  });

  assert.deepEqual(
    { refused: decision.refused, tag: decision.tag },
    {
      refused: false,
      tag: "cloud-v1.0.0",
    },
  );
});

test("among several release tags on that commit, the highest version is the baseline", () => {
  const decision = decideBaseline({
    deploymentList: DEPLOYED,
    health: healthy(SERVED_SHA),
    tagsAtVersion: ["cloud-v1.9.0", "pos-v3.0.0", "cloud-v1.10.0", "cloud-v2.0", "cloud-v1.2.0"],
    prefix: PREFIX,
  });

  assert.equal(decision.tag, "cloud-v1.10.0");
});

test("refuses when production has deployments but its health does not answer", () => {
  for (const health of [null, { status: 503, body: { status: "error" } }]) {
    const decision = decideBaseline({ deploymentList: DEPLOYED, health, prefix: PREFIX });

    assert.equal(decision.refused, true);
    assert.equal(decision.tag, undefined);
  }
});

test("refuses when production's health reports no commit", () => {
  for (const version of [undefined, "dev", "c".repeat(39), "g".repeat(40)]) {
    const decision = decideBaseline({
      deploymentList: DEPLOYED,
      health: healthy(version),
      prefix: PREFIX,
    });

    assert.equal(decision.refused, true);
  }
});

test("refuses when no release tag points at the commit production serves", () => {
  const decision = decideBaseline({
    deploymentList: DEPLOYED,
    health: healthy(SERVED_SHA),
    tagsAtVersion: ["pos-v1.0.0", "cloud-v1.0"],
    prefix: PREFIX,
  });

  assert.equal(decision.refused, true);
  assert.match(decision.reason, new RegExp(SERVED_SHA));
});

test("refuses when the deployments cannot be listed", () => {
  const decision = decideBaseline({
    deploymentList: { deployments: [], error: "Unauthorized" },
    prefix: PREFIX,
  });

  assert.equal(decision.refused, true);
  assert.match(decision.reason, /Unauthorized/);
});

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.test",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.test",
};

function registerVersionSource(minimum) {
  return `export const MINIMUM_ACCEPTED_REGISTER_VERSION = "${minimum}";
export function versionAtLeast(version: string, minimum: string): boolean {
  const [a, b] = [version, minimum].map((value) => value.split(".").map(Number));
  for (const [index, part] of a.entries()) {
    if (part !== b[index]) return part > b[index];
  }
  return true;
}
`;
}

async function withReleases(run) {
  const dir = mkdtempSync(join(tmpdir(), "production-baseline-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, env: GIT_ENV, encoding: "utf8" });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  const release = (tag, files) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    git("add", "-A");
    git("commit", "--quiet", "-m", `release ${tag}`);
    git("tag", tag);
    return git("rev-parse", "HEAD").trim();
  };
  try {
    await run({
      runGit: async (args) => git(...args),
      v100: release("cloud-v1.0.0", { [REGISTER_VERSION_PATH]: registerVersionSource("1.0.0") }),
      v110: release("cloud-v1.1.0", { [REGISTER_VERSION_PATH]: registerVersionSource("2.0.0") }),
      v111: release("cloud-v1.1.1", { "apps/cloud/src/round.ts": "1" }),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function baselineDeps({ runGit, railway, health }) {
  const calls = { railway: [], fetched: [], outputs: [], logs: [], errors: [] };
  return {
    calls,
    deps: {
      env: {
        RAILWAY_SERVICE: "Cloud Server",
        RAILWAY_ENVIRONMENT: "production",
        PRODUCTION_DOMAIN: "prod.example.test",
        RELEASE_TAG_PREFIX: PREFIX,
        GITHUB_OUTPUT: "/output",
      },
      runRailway: async (args) => {
        calls.railway.push(args);
        return railway;
      },
      runGit,
      fetchImpl: async (url) => {
        calls.fetched.push(url);
        if (health === null) throw new Error("connection refused");
        return { status: health.status, json: async () => health.body };
      },
      appendOutput: async (path, text) => calls.outputs.push({ path, text }),
      log: (message) => calls.logs.push(message),
      logError: (message) => calls.errors.push(message),
    },
  };
}

const LISTED = { exitOk: true, stdout: JSON.stringify([{ id: "d1", status: "SUCCESS" }]) };

test("names the release production serves after a rollback, so a raise over it asks production", async () => {
  await withReleases(async ({ runGit, v100, v111 }) => {
    const { deps, calls } = baselineDeps({ runGit, railway: LISTED, health: healthy(v100) });

    assert.equal(await runCli(deps), 0);
    assert.deepEqual(calls.outputs, [{ path: "/output", text: "previous_tag=cloud-v1.0.0\n" }]);

    const asked = [];
    const exitCode = await runRegisterMinimumCheck({
      env: {
        TARGET_SHA: v111,
        PREVIOUS_TAG: "cloud-v1.0.0",
        PRODUCTION_ORIGIN: "https://prod.example.test",
        RELEASE_CHECK_TOKEN: "release-token",
      },
      runGit,
      fetchImpl: async (url) => {
        asked.push(url);
        return {
          status: 200,
          json: async () => ({ registers: [{ register_name: "Caja 1", app_version: "1.5.0" }] }),
        };
      },
      log: () => {},
      logError: () => {},
    });

    assert.deepEqual(asked, [
      "https://prod.example.test/api/sync/registers-below-minimum?minimum=2.0.0",
    ]);
    assert.equal(exitCode, 1);
  });
});

test("names a release production serves even when its promotion never finished verifying", async () => {
  await withReleases(async ({ runGit, v110 }) => {
    const { deps, calls } = baselineDeps({ runGit, railway: LISTED, health: healthy(v110) });

    assert.equal(await runCli(deps), 0);
    assert.deepEqual(calls.outputs, [{ path: "/output", text: "previous_tag=cloud-v1.1.0\n" }]);
  });
});

test("asks Railway for the deployments of the service in the environment, and production's health", async () => {
  await withReleases(async ({ runGit, v100 }) => {
    const { deps, calls } = baselineDeps({ runGit, railway: LISTED, health: healthy(v100) });

    await runCli(deps);

    assert.deepEqual(calls.railway, [
      [
        "deployment",
        "list",
        "--service",
        "Cloud Server",
        "--environment",
        "production",
        "--json",
        "--limit",
        String(DEPLOYMENT_LIST_LIMIT),
      ],
    ]);
    assert.deepEqual(calls.fetched, ["https://prod.example.test/api/health"]);
  });
});

test("writes an empty baseline for the first release, without asking production's health", async () => {
  await withReleases(async ({ runGit }) => {
    const { deps, calls } = baselineDeps({
      runGit,
      railway: { exitOk: true, stdout: "[]" },
      health: null,
    });

    assert.equal(await runCli(deps), 0);
    assert.deepEqual(calls.outputs, [{ path: "/output", text: "previous_tag=\n" }]);
    assert.deepEqual(calls.fetched, []);
    assert.notEqual(calls.logs.length, 0);
  });
});

test("writes an empty baseline when every production deployment failed, without asking production's health", async () => {
  await withReleases(async ({ runGit }) => {
    const { deps, calls } = baselineDeps({
      runGit,
      railway: {
        exitOk: true,
        stdout: JSON.stringify([
          { id: "d2", status: "FAILED" },
          { id: "d1", status: "SKIPPED" },
        ]),
      },
      health: null,
    });

    assert.equal(await runCli(deps), 0);
    assert.deepEqual(calls.outputs, [{ path: "/output", text: "previous_tag=\n" }]);
    assert.deepEqual(calls.fetched, []);
    assert.notEqual(calls.logs.length, 0);
  });
});

test("names the release an older successful deployment serves behind a newer failed one", async () => {
  await withReleases(async ({ runGit, v100 }) => {
    const { deps, calls } = baselineDeps({
      runGit,
      railway: {
        exitOk: true,
        stdout: JSON.stringify([
          { id: "d2", status: "FAILED" },
          { id: "d1", status: "SUCCESS" },
        ]),
      },
      health: healthy(v100),
    });

    assert.equal(await runCli(deps), 0);
    assert.deepEqual(calls.outputs, [{ path: "/output", text: "previous_tag=cloud-v1.0.0\n" }]);
  });
});

test("refuses the promotion when a crashed, removed or unknown deployment is listed and production's health does not answer", async () => {
  await withReleases(async ({ runGit }) => {
    for (const status of ["CRASHED", "REMOVED", "SOMETHING_NEW"]) {
      const { deps, calls } = baselineDeps({
        runGit,
        railway: { exitOk: true, stdout: JSON.stringify([{ id: "d1", status }]) },
        health: null,
      });

      assert.equal(await runCli(deps), 1, status);
      assert.deepEqual(calls.outputs, []);
      assert.notEqual(calls.errors.length, 0);
    }
  });
});

test("refuses the promotion when production's baseline cannot be told", async () => {
  await withReleases(async ({ runGit }) => {
    const untagged = "d".repeat(40);
    for (const { railway, health } of [
      { railway: { exitOk: false, stdout: "", stderr: "Unauthorized" }, health: healthy(untagged) },
      { railway: LISTED, health: null },
      { railway: LISTED, health: { status: 502, body: undefined } },
      { railway: LISTED, health: healthy(untagged) },
    ]) {
      const { deps, calls } = baselineDeps({ runGit, railway, health });

      assert.equal(await runCli(deps), 1);
      assert.deepEqual(calls.outputs, []);
      assert.notEqual(calls.errors.length, 0);
    }
  });
});

test("fails without its inputs", async () => {
  const { deps, calls } = baselineDeps({ runGit: async () => "", railway: LISTED, health: null });

  assert.equal(await runCli({ ...deps, env: { ...deps.env, PRODUCTION_DOMAIN: "" } }), 1);
  assert.deepEqual(calls.railway, []);
  assert.deepEqual(calls.outputs, []);
});
