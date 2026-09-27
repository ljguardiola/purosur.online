import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveBaseRef, resolveBaseSha } from "./change-base.mjs";
import {
  checkCommits,
  describeCommitViolation,
  listCommitsSince,
} from "./no-secrets-in-commit-history.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const repoConfigFilePath = join(repoRoot, ".secretlintrc.json");

const PRIVATE_KEY = [
  "-----BEGIN RSA PRIVATE KEY-----",
  "MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu",
  "KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIJLixBy2qpFoS4DSmoEm",
  "-----END RSA PRIVATE KEY-----",
].join("\n");

const KNOWN_FAKE_DATABASE_URL_LINE =
  'env: { ...process.env, DATABASE_URL: "postgres://user:s3cret-password@[bad/db" },';

const UUID_SHAPED_VALUE = ["5f0c7a2e", "8b1d", "4c3e", "9a6f", "2d7b1e0c4a93"].join("-");

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function writeTracked(dir, relativePath, content) {
  const fullPath = join(dir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  git(["add", relativePath], dir);
}

function removeTracked(dir, relativePath) {
  unlinkSync(join(dir, relativePath));
  git(["add", relativePath], dir);
}

function commit(dir, message) {
  git(["commit", "-q", "-m", message], dir);
  return git(["rev-parse", "HEAD"], dir);
}

async function withFixtureRepo(run) {
  const dir = mkdtempSync(join(tmpdir(), "no-secrets-in-commit-history-"));
  try {
    git(["init", "-q", "-b", "main"], dir);
    git(["config", "user.email", "fixture@example.com"], dir);
    git(["config", "user.name", "Fixture"], dir);
    writeTracked(dir, "README.md", "fixture\n");
    const base = commit(dir, "base");
    await run(dir, base);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function violationsSince(base, dir) {
  return checkCommits(listCommitsSince(base, dir), {
    cwd: dir,
    configFilePath: repoConfigFilePath,
  });
}

test("lists the commits after the base, oldest first", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, "a.txt", "a\n");
    const first = commit(dir, "first");
    writeTracked(dir, "b.txt", "b\n");
    const second = commit(dir, "second");

    assert.deepEqual(listCommitsSince(base, dir), [first, second]);
  });
});

test("flags a secret a commit added even though a later commit removed it", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, "config/key.txt", PRIVATE_KEY);
    const added = commit(dir, "add a key");
    removeTracked(dir, "config/key.txt");
    commit(dir, "remove the key");

    const violations = await violationsSince(base, dir);

    assert.deepEqual(
      violations.map(({ commit, path, line }) => ({ commit, path, line })),
      [{ commit: added, path: "config/key.txt", line: 1 }],
    );
    assert.match(violations[0].message, /^@secretlint\/secretlint-rule-privatekey: /);
  });
});

test("reports the line where the commit added the secret in its file", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, "notes.txt", "one\ntwo\n");
    commit(dir, "notes");
    writeTracked(dir, "notes.txt", `one\ntwo\n${PRIVATE_KEY}\n`);
    const added = commit(dir, "append a key");

    const violations = await violationsSince(base, dir);

    assert.deepEqual(
      violations.map(({ commit, path, line }) => ({ commit, path, line })),
      [{ commit: added, path: "notes.txt", line: 3 }],
    );
  });
});

test("flags a secret added as a single line in an existing file", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, "deploy.sh", "set -eu\n");
    commit(dir, "deploy script");
    writeTracked(dir, "deploy.sh", `set -eu\nRAILWAY_TOKEN=${UUID_SHAPED_VALUE}\n`);
    const added = commit(dir, "hardcode a token");

    const violations = await violationsSince(base, dir);

    assert.deepEqual(
      violations.map(({ commit, path, line }) => ({ commit, path, line })),
      [{ commit: added, path: "deploy.sh", line: 2 }],
    );
  });
});

test("does not blame a later commit that only changes other lines of a file holding the secret", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, "notes.txt", `${PRIVATE_KEY}\nend\n`);
    const added = commit(dir, "add a key");
    writeTracked(dir, "notes.txt", `${PRIVATE_KEY}\nthe end\n`);
    commit(dir, "edit another line");

    const violations = await violationsSince(base, dir);

    assert.deepEqual(
      violations.map((violation) => violation.commit),
      [added],
    );
  });
});

test("ignores commits already in the base", async () => {
  await withFixtureRepo(async (dir) => {
    writeTracked(dir, "config/key.txt", PRIVATE_KEY);
    commit(dir, "add a key");
    removeTracked(dir, "config/key.txt");
    const base = commit(dir, "remove the key");
    writeTracked(dir, "a.txt", "a\n");
    commit(dir, "unrelated");

    assert.deepEqual(await violationsSince(base, dir), []);
  });
});

test("accepts the test fixture credential the tracked-file scan allows", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, "known.test.ts", KNOWN_FAKE_DATABASE_URL_LINE);
    commit(dir, "fixture");

    assert.deepEqual(await violationsSince(base, dir), []);
  });
});

test("flags a secret file a commit added even though a later commit deleted it", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, ".env", "MODE=local\n");
    const added = commit(dir, "add an env file");
    removeTracked(dir, ".env");
    commit(dir, "remove the env file");

    const violations = await violationsSince(base, dir);

    assert.deepEqual(
      violations.map(({ commit, path }) => ({ commit, path })),
      [{ commit: added, path: ".env" }],
    );
    assert.match(violations[0].message, /holds environment secrets/);
  });
});

test("flags a binary key file a commit added even though a later commit deleted it", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, "cert.p12", Buffer.from([0x30, 0x82, 0x00, 0x00, 0xff, 0x00, 0x01, 0x02]));
    const added = commit(dir, "add a certificate");
    removeTracked(dir, "cert.p12");
    commit(dir, "remove the certificate");

    const violations = await violationsSince(base, dir);

    assert.deepEqual(
      violations.map(({ commit, path }) => ({ commit, path })),
      [{ commit: added, path: "cert.p12" }],
    );
  });
});

test("flags a scanner suppression comment a commit added", async () => {
  await withFixtureRepo(async (dir, base) => {
    const suppression = ["secretlint", "disable"].join("-");
    writeTracked(dir, "block.txt", `# ${suppression}\n${PRIVATE_KEY}\n`);
    const added = commit(dir, "hide a key");

    const violations = await violationsSince(base, dir);

    assert.ok(violations.length > 0);
    assert.ok(violations.every((violation) => violation.commit === added));
    assert.ok(violations.some((violation) => /suppression comment/.test(violation.message)));
  });
});

test("flags a secret a merge commit added while resolving a conflict", async () => {
  await withFixtureRepo(async (dir, base) => {
    writeTracked(dir, "notes.txt", "one\n");
    commit(dir, "notes");
    git(["checkout", "-q", "-b", "side"], dir);
    writeTracked(dir, "notes.txt", "side\n");
    commit(dir, "side edit");
    git(["checkout", "-q", "main"], dir);
    writeTracked(dir, "notes.txt", "main\n");
    commit(dir, "main edit");
    spawnSync("git", ["merge", "-q", "side"], { cwd: dir });
    writeTracked(dir, "notes.txt", `${PRIVATE_KEY}\n`);
    const merge = commit(dir, "merge side");

    const violations = await violationsSince(base, dir);

    assert.deepEqual(
      violations.map(({ commit, path, line }) => ({ commit, path, line })),
      [{ commit: merge, path: "notes.txt", line: 1 }],
    );
  });
});

test("describes a violation with its commit, file and line, and asks to rotate the secret", () => {
  const description = describeCommitViolation({
    commit: "0123456789abcdef0123456789abcdef01234567",
    path: "config/key.txt",
    line: 1,
    message: "found private key: ****",
  });

  assert.match(description, /0123456789abcdef0123456789abcdef01234567/);
  assert.match(description, /config\/key\.txt:1: found private key: \*\*\*\*/);
  assert.match(description, /rotate/);
});

test("no commit since the change's base adds a secret", async () => {
  const ref = resolveBaseRef(process.env);
  const base = resolveBaseSha({ ref, runGit: (args) => git(args, repoRoot) });
  assert.ok(
    base,
    `could not resolve base ref "${ref}" for the commit history secret scan — fetch it first, e.g. \`git fetch origin main\``,
  );

  const violations = await checkCommits(listCommitsSince(base, repoRoot), {
    cwd: repoRoot,
    configFilePath: repoConfigFilePath,
  });

  assert.deepEqual(
    violations.map(describeCommitViolation),
    [],
    "a secret pushed in any commit stays readable in that commit's history on GitHub even after a " +
      "later commit removes it: rotate it, then rewrite or close the pull request.",
  );
});
