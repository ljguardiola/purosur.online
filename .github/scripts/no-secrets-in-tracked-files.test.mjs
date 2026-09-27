import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkFiles, describeViolation, findTrackedFiles } from "./no-secrets-in-tracked-files.mjs";

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

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function trackFile(dir, relativePath, content, gitAddArgs = []) {
  const fullPath = join(dir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  git(["add", ...gitAddArgs, relativePath], dir);
}

async function withTempRepo(run) {
  const dir = mkdtempSync(join(tmpdir(), "no-secrets-in-tracked-files-"));
  try {
    git(["init", "-q"], dir);
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("flags a private key in a tracked file, with its path and line", async () => {
  await withTempRepo(async (dir) => {
    trackFile(dir, "config/key.txt", PRIVATE_KEY);

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.equal(violations.length, 1);
    assert.equal(violations[0].path, "config/key.txt");
    assert.equal(violations[0].line, 1);
  });
});

test("flags a secret in a tracked file that .gitignore ignores, once force-added", async () => {
  await withTempRepo(async (dir) => {
    trackFile(dir, ".gitignore", "*.pem\n");
    trackFile(dir, "secret.pem", PRIVATE_KEY, ["-f"]);

    const files = findTrackedFiles(dir);
    assert.ok(files.includes("secret.pem"));

    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.ok(violations.some((violation) => violation.path === "secret.pem"));
  });
});

test("ignores an untracked file that contains a secret", async () => {
  await withTempRepo(async (dir) => {
    writeFileSync(join(dir, "untracked.txt"), PRIVATE_KEY);

    const files = findTrackedFiles(dir);

    assert.ok(!files.includes("untracked.txt"));
  });
});

test("ignores a tracked file deleted from the working tree, without crashing", async () => {
  await withTempRepo(async (dir) => {
    trackFile(dir, "gone.txt", PRIVATE_KEY);
    unlinkSync(join(dir, "gone.txt"));

    const files = findTrackedFiles(dir);

    assert.ok(!files.includes("gone.txt"));
  });
});

test("accepts the known fake test credential but still flags a different password in the same shape", async () => {
  await withTempRepo(async (dir) => {
    trackFile(dir, "known.test.ts", KNOWN_FAKE_DATABASE_URL_LINE);
    trackFile(
      dir,
      "different.test.ts",
      KNOWN_FAKE_DATABASE_URL_LINE.replace("s3cret-password", "different-password"),
    );

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.deepEqual(
      violations.map((violation) => violation.path),
      ["different.test.ts"],
    );
  });
});

test("never includes the secret value in a reported message", async () => {
  await withTempRepo(async (dir) => {
    trackFile(dir, "config/key.txt", PRIVATE_KEY);

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.ok(violations.length > 0);
    for (const violation of violations) {
      assert.ok(
        !violation.message.includes(
          "MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu",
        ),
      );
    }
  });
});

test("describes a violation with its file, line and message", () => {
  const description = describeViolation({
    path: "config/key.txt",
    line: 1,
    message: "found private key: ****",
  });

  assert.equal(description, "config/key.txt:1: found private key: ****");
});

test("no file this repository tracks contains a secret", async () => {
  const files = findTrackedFiles(repoRoot);
  assert.ok(files.length > 0, "expected to find at least one tracked file to scan");

  const violations = await checkFiles(files, { cwd: repoRoot, configFilePath: repoConfigFilePath });

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "a secret committed to a tracked file reaches every clone and, once pushed, every fork; " +
      "remove it and rotate it instead of allowing it here.",
  );
});
