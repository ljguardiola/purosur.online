import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  classifyCommit,
  includedPathsAt,
  nextVersion,
  planRelease,
  ReleaseRefusal,
  releaseNotes,
  runCli,
  workspaceGlobs,
} from "./release-version.mjs";

const SPEC = {
  prefix: "cloud-v",
  rootPackages: ["@purosur/cloud", "@purosur/backoffice"],
};

function manifest(name, { dependencies = [], devDependencies = [] } = {}) {
  const workspaceSpecs = (names) => Object.fromEntries(names.map((dep) => [dep, "workspace:*"]));
  return JSON.stringify({
    name,
    dependencies: workspaceSpecs(dependencies),
    devDependencies: workspaceSpecs(devDependencies),
  });
}

const BASE_FILES = {
  "package.json": '{"name":"root"}',
  "pnpm-lock.yaml": "lock: 1\n",
  "pnpm-workspace.yaml":
    "packages:\n  - packages/*\n  - apps/*\n\nallowBuilds:\n  electron: true\n",
  "tsconfig.json": "{}",
  ".node-version": "24.0.0\n",
  "apps/cloud/package.json": manifest("@purosur/cloud", {
    dependencies: ["@purosur/contracts", "@purosur/domain"],
  }),
  "apps/backoffice/package.json": manifest("@purosur/backoffice", {
    dependencies: ["@purosur/ui"],
    devDependencies: ["@purosur/contracts"],
  }),
  "apps/pos/package.json": manifest("@purosur/pos", {
    dependencies: ["@purosur/domain", "@purosur/hardware"],
  }),
  "packages/contracts/package.json": manifest("@purosur/contracts", {
    dependencies: ["@purosur/domain"],
  }),
  "packages/domain/package.json": manifest("@purosur/domain"),
  "packages/ui/package.json": manifest("@purosur/ui", { devDependencies: ["@purosur/tokens"] }),
  "packages/tokens/package.json": manifest("@purosur/tokens"),
  "packages/hardware/package.json": manifest("@purosur/hardware"),
};

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.test",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.test",
};

function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), "release-version-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, env: GIT_ENV, encoding: "utf8" });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  let counter = 0;
  const repo = {
    dir,
    git,
    runGit: async (args) => git(...args),
    commit(message, files = {}) {
      counter += 1;
      const toWrite = Object.keys(files).length > 0 ? files : { [`noise/${counter}.txt`]: "x" };
      for (const [path, content] of Object.entries(toWrite)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), content);
      }
      git("add", "-A");
      git("commit", "--quiet", "-m", message);
      return git("rev-parse", "HEAD").trim();
    },
    tag: (name, ref = "HEAD") => git("tag", name, ref),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
  repo.commit("chore: scaffold the workspace", BASE_FILES);
  return repo;
}

async function withRepo(run) {
  const repo = fixtureRepo();
  try {
    await run(repo);
  } finally {
    repo.cleanup();
  }
}

function plan(repo, sha = repo.git("rev-parse", "HEAD").trim()) {
  return planRelease({ spec: SPEC, sha, runGit: repo.runGit });
}

test("reads the package globs of a pnpm workspace file", () => {
  assert.deepEqual(
    workspaceGlobs("packages:\n  - packages/*\n  - apps/*\n\nallowBuilds:\n  - not-a-glob/*\n"),
    ["packages/*", "apps/*"],
  );
});

test("includes the root packages' folders, every workspace package they depend on transitively, and the root build files", async () => {
  await withRepo(async (repo) => {
    const paths = await includedPathsAt({
      sha: repo.git("rev-parse", "HEAD").trim(),
      rootPackages: SPEC.rootPackages,
      runGit: repo.runGit,
    });

    assert.deepEqual(paths, [
      ".node-version",
      "apps/backoffice",
      "apps/cloud",
      "package.json",
      "packages/contracts",
      "packages/domain",
      "packages/tokens",
      "packages/ui",
      "patches",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.json",
    ]);
  });
});

test("names an unknown root package instead of ignoring it", async () => {
  await withRepo(async (repo) => {
    await assert.rejects(
      includedPathsAt({
        sha: repo.git("rev-parse", "HEAD").trim(),
        rootPackages: ["@purosur/missing"],
        runGit: repo.runGit,
      }),
      /@purosur\/missing/,
    );
  });
});

test("releases 1.0.0 when no release tag exists, listing every included change", async () => {
  await withRepo(async (repo) => {
    repo.commit("feat: sell by weight (#10)", { "apps/cloud/src/weight.ts": "1" });

    const release = await plan(repo);

    assert.equal(release.version, "1.0.0");
    assert.equal(release.tag, "cloud-v1.0.0");
    assert.equal(release.previousTag, null);
    assert.deepEqual(
      release.commits.map((commit) => commit.subject),
      ["feat: sell by weight (#10)", "chore: scaffold the workspace"],
    );
  });
});

test("a fix since the previous release raises the patch number", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.4.2");
    repo.commit("fix: round totals (#11)", { "packages/domain/src/round.ts": "1" });

    assert.equal((await plan(repo)).version, "1.4.3");
  });
});

test("an unrecognized change type raises the patch number", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.4.2");
    repo.commit("chore: bump the lockfile (#12)", { "pnpm-lock.yaml": "lock: 2\n" });

    assert.equal((await plan(repo)).version, "1.4.3");
  });
});

test("a feature since the previous release raises the minor number and resets the patch", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.4.2");
    repo.commit("fix: round totals (#11)", { "packages/domain/src/round.ts": "1" });
    repo.commit("feat(stock): list lots (#12)", { "apps/cloud/src/stock.ts": "1" });

    assert.equal((await plan(repo)).version, "1.5.0");
  });
});

test("a breaking subject raises the major number", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.4.2");
    repo.commit("feat(api)!: drop the v1 sync (#13)", { "apps/cloud/src/sync.ts": "1" });

    assert.equal((await plan(repo)).version, "2.0.0");
  });
});

test("a BREAKING CHANGE footer raises the major number", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.4.2");
    repo.commit("fix: change the sync reply (#14)\n\nBREAKING CHANGE: the reply is now a list", {
      "apps/cloud/src/sync.ts": "1",
    });

    assert.equal((await plan(repo)).version, "2.0.0");
  });
});

test("compares release tags as versions, not as text, and ignores other prefixes and malformed tags", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.9.0");
    repo.commit("fix: first (#1)", { "apps/cloud/src/a.ts": "1" });
    repo.tag("cloud-v1.10.0");
    repo.tag("pos-v9.0.0");
    repo.tag("cloud-v1.0");
    repo.tag("cloud-v1.10.1-rc1");
    repo.commit("fix: second (#2)", { "apps/cloud/src/b.ts": "1" });

    const release = await plan(repo);

    assert.equal(release.previousTag, "cloud-v1.10.0");
    assert.equal(release.version, "1.10.1");
  });
});

test("a release tag that is not an ancestor of the target is not the previous release", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.0.0");
    repo.git("checkout", "--quiet", "-b", "side");
    repo.commit("feat: side work (#3)", { "apps/cloud/src/side.ts": "1" });
    repo.tag("cloud-v1.1.0");
    repo.git("checkout", "--quiet", "main");
    repo.commit("fix: main work (#4)", { "apps/cloud/src/main.ts": "1" });

    const release = await plan(repo);

    assert.equal(release.previousTag, "cloud-v1.0.0");
  });
});

test("lists only the changes since the previous release", async () => {
  await withRepo(async (repo) => {
    repo.commit("feat: before (#5)", { "apps/cloud/src/before.ts": "1" });
    repo.tag("cloud-v1.0.0");
    repo.commit("fix: after (#6)", { "apps/cloud/src/after.ts": "1" });

    const release = await plan(repo);

    assert.deepEqual(
      release.commits.map((commit) => commit.subject),
      ["fix: after (#6)"],
    );
  });
});

test("a change to the register or to a package the root packages do not include never appears", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.0.0");
    repo.commit("feat: register scale support (#20)", { "apps/pos/src/scale.ts": "1" });
    repo.commit("feat: new printer driver (#21)", { "packages/hardware/src/printer.ts": "1" });
    repo.commit("fix: cloud rounding (#22)", { "apps/cloud/src/round.ts": "1" });
    repo.commit("fix: notes only (#23)", { "README.md": "x" });

    const release = await plan(repo);

    assert.deepEqual(
      release.commits.map((commit) => commit.subject),
      ["fix: cloud rounding (#22)"],
    );
    assert.doesNotMatch(release.notes, /register scale|printer driver|notes only/);
  });
});

test("a change to a root build file or an included shared package appears", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.0.0");
    repo.commit("chore: pin typescript (#30)", { "tsconfig.json": '{"a":1}' });
    repo.commit("fix: token contrast (#31)", { "packages/tokens/src/color.ts": "1" });

    const release = await plan(repo);

    assert.deepEqual(
      release.commits.map((commit) => commit.subject),
      ["fix: token contrast (#31)", "chore: pin typescript (#30)"],
    );
  });
});

test("refuses to release when nothing included changed since the previous release", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.0.0");
    repo.commit("feat: register scale support (#20)", { "apps/pos/src/scale.ts": "1" });

    await assert.rejects(plan(repo), (error) => {
      assert.ok(error instanceof ReleaseRefusal);
      assert.match(error.message, /nothing to release/);
      return true;
    });
  });
});

test("refuses the commit a release tag already points at", async () => {
  await withRepo(async (repo) => {
    repo.commit("fix: round (#40)", { "apps/cloud/src/round.ts": "1" });
    repo.tag("cloud-v1.0.0");

    await assert.rejects(plan(repo), /cloud-v1\.0\.0/);
  });
});

test("refuses a commit older than the newest release", async () => {
  await withRepo(async (repo) => {
    const older = repo.commit("fix: round (#41)", { "apps/cloud/src/round.ts": "1" });
    repo.commit("fix: floor (#42)", { "apps/cloud/src/floor.ts": "1" });
    repo.tag("cloud-v1.0.0");

    await assert.rejects(plan(repo, older), /cloud-v1\.0\.0/);
  });
});

test("groups the notes by kind and keeps each subject's pull request reference", () => {
  const notes = releaseNotes([
    { subject: "fix: round totals (#11)", body: "" },
    { subject: "feat(stock): list lots (#12)", body: "" },
    { subject: "chore: bump the lockfile (#13)", body: "" },
    { subject: "feat(api)!: drop the v1 sync (#14)", body: "" },
    { subject: "fix: change the sync reply (#15)", body: "BREAKING CHANGE: a list now" },
  ]);

  assert.equal(
    notes,
    [
      "## Breaking changes",
      "",
      "- feat(api)!: drop the v1 sync (#14)",
      "- fix: change the sync reply (#15)",
      "",
      "## Features",
      "",
      "- feat(stock): list lots (#12)",
      "",
      "## Fixes",
      "",
      "- fix: round totals (#11)",
      "",
      "## Other changes",
      "",
      "- chore: bump the lockfile (#13)",
      "",
    ].join("\n"),
  );
});

test("leaves out a group that has no change", () => {
  assert.equal(
    releaseNotes([{ subject: "fix: round totals (#11)", body: "" }]),
    "## Fixes\n\n- fix: round totals (#11)\n",
  );
});

test("classifies a subject that is not a conventional commit as another change", () => {
  assert.deepEqual(classifyCommit({ subject: "Merge the thing", body: "" }), {
    kind: "other",
    breaking: false,
  });
});

test("computes the next version from the previous one and the changes' kinds", () => {
  assert.equal(nextVersion({ previousVersion: null, kinds: [] }), "1.0.0");
  assert.equal(nextVersion({ previousVersion: "2.3.4", kinds: ["other"] }), "2.3.5");
  assert.equal(nextVersion({ previousVersion: "2.3.4", kinds: ["fix", "feature"] }), "2.4.0");
  assert.equal(nextVersion({ previousVersion: "2.3.4", kinds: ["feature", "breaking"] }), "3.0.0");
});

function cliDeps(repo, env) {
  const calls = { outputs: [], notes: [], logs: [], errors: [] };
  return {
    calls,
    deps: {
      env: {
        RELEASE_TAG_PREFIX: "cloud-v",
        RELEASE_ROOT_PACKAGES: "@purosur/cloud,@purosur/backoffice",
        TARGET_SHA: repo.git("rev-parse", "HEAD").trim(),
        RELEASE_NOTES_FILE: "/notes.md",
        GITHUB_OUTPUT: "/output",
        ...env,
      },
      runGit: repo.runGit,
      appendOutput: async (path, text) => calls.outputs.push({ path, text }),
      writeNotes: async (path, text) => calls.notes.push({ path, text }),
      log: (message) => calls.logs.push(message),
      logError: (message) => calls.errors.push(message),
    },
  };
}

test("the command writes the version, the tag and the notes file", async () => {
  await withRepo(async (repo) => {
    repo.commit("feat: sell by weight (#10)", { "apps/cloud/src/weight.ts": "1" });
    const { deps, calls } = cliDeps(repo);

    const exitCode = await runCli({ argv: ["plan"], ...deps });

    assert.equal(exitCode, 0);
    assert.deepEqual(calls.outputs, [
      { path: "/output", text: "version=1.0.0\ntag=cloud-v1.0.0\n" },
    ]);
    assert.deepEqual(calls.notes, [
      {
        path: "/notes.md",
        text: "## Features\n\n- feat: sell by weight (#10)\n\n## Other changes\n\n- chore: scaffold the workspace\n",
      },
    ]);
  });
});

test("the command fails with the refusal's reason", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.0.0");
    const { deps, calls } = cliDeps(repo);

    const exitCode = await runCli({ argv: ["plan"], ...deps });

    assert.equal(exitCode, 1);
    assert.match(calls.errors.join("\n"), /cloud-v1\.0\.0/);
    assert.deepEqual(calls.outputs, []);
  });
});

test("the command fails without its inputs", async () => {
  await withRepo(async (repo) => {
    const { deps, calls } = cliDeps(repo, { RELEASE_TAG_PREFIX: "" });

    assert.equal(await runCli({ argv: ["plan"], ...deps }), 1);
    assert.equal(await runCli({ argv: [], ...deps }), 1);
    assert.notEqual(calls.errors.length, 0);
  });
});

test("the previous-tag command names the newest release before the tag being promoted", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.0.0");
    repo.commit("fix: round (#50)", { "apps/cloud/src/round.ts": "1" });
    repo.tag("cloud-v1.0.1");
    const { deps, calls } = cliDeps(repo, { RELEASE_TAG: "cloud-v1.0.1" });

    const exitCode = await runCli({ argv: ["previous-tag"], ...deps });

    assert.equal(exitCode, 0);
    assert.deepEqual(calls.outputs, [{ path: "/output", text: "previous_tag=cloud-v1.0.0\n" }]);
  });
});

test("the previous-tag command writes an empty value for the first release", async () => {
  await withRepo(async (repo) => {
    repo.tag("cloud-v1.0.0");
    const { deps, calls } = cliDeps(repo, { RELEASE_TAG: "cloud-v1.0.0" });

    await runCli({ argv: ["previous-tag"], ...deps });

    assert.deepEqual(calls.outputs, [{ path: "/output", text: "previous_tag=\n" }]);
  });
});

test("the previous-tag command refuses a tag that is not a release tag of the prefix", async () => {
  await withRepo(async (repo) => {
    const { deps, calls } = cliDeps(repo, { RELEASE_TAG: "cloud-v1.0" });

    assert.equal(await runCli({ argv: ["previous-tag"], ...deps }), 1);
    assert.match(calls.errors.join("\n"), /cloud-v1\.0/);
  });
});
