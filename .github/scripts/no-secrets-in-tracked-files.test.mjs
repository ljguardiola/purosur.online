import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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

const KNOWN_FAKE_DATABASE_URL = "postgres://user:s3cret-password@[bad/db";
const KNOWN_FAKE_DATABASE_URL_LINE = `env: { ...process.env, DATABASE_URL: "${KNOWN_FAKE_DATABASE_URL}" },`;

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

test("flags a force-added binary key file that the content scan cannot read", async () => {
  await withTempRepo(async (dir) => {
    trackFile(dir, ".gitignore", "*.p12\n");
    trackFile(dir, "cert.p12", Buffer.from([0x30, 0x82, 0x00, 0x00, 0xff, 0x00, 0x01, 0x02]), [
      "-f",
    ]);

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.equal(violations.length, 1);
    assert.equal(violations[0].path, "cert.p12");
    assert.match(violations[0].message, /holds secrets and never lives in the repository/);
  });
});

test("flags every tracked file whose name marks it as a secret carrier", async () => {
  await withTempRepo(async (dir) => {
    const carriers = [
      ".env",
      ".env.production",
      "config/staging.env",
      "server.key",
      "tls/server.pem",
      "server.crt",
      "server.csr",
      "cert.p12",
      "cert.pfx",
    ];
    for (const carrier of carriers) trackFile(dir, carrier, "placeholder\n");

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.deepEqual(violations.map((violation) => violation.path).sort(), [...carriers].sort());
  });
});

test("accepts the example environment files that document the variables", async () => {
  await withTempRepo(async (dir) => {
    trackFile(dir, ".env.example", "MODE=local\n");
    trackFile(dir, "apps/cloud/cloud.env.example", "MODE=local\n");

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.deepEqual(violations, []);
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

test("flags a file whose scanner suppression comment would hide a secret from the scan", async () => {
  await withTempRepo(async (dir) => {
    const suppression = ["secretlint", "disable"].join("-");
    trackFile(
      dir,
      "same-line.test.ts",
      `const url = "${KNOWN_FAKE_DATABASE_URL.replace("s3cret-password", "different-password")}"; // ${suppression}-line\n`,
    );
    trackFile(dir, "block.txt", `# ${suppression}\n${PRIVATE_KEY}\n`);

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.deepEqual(violations.map(({ path, line }) => `${path}:${line}`).sort(), [
      "block.txt:1",
      "same-line.test.ts:1",
    ]);
    for (const violation of violations) assert.match(violation.message, /suppression comment/);
  });
});

const UUID_SHAPED_VALUE = ["5f0c7a2e", "8b1d", "4c3e", "9a6f", "2d7b1e0c4a93"].join("-");
const MIXED_32_CHAR_VALUE = ["re_Q7wX2kLp", "9Vt4ZbN8", "sR3mYc6H", "dJ1fGa"].join("");

function workflowSecretNames() {
  const names = globSync(".github/workflows/*.{yml,yaml}", { cwd: repoRoot }).flatMap((path) =>
    [...readFileSync(join(repoRoot, path), "utf8").matchAll(/\bsecrets\.([A-Za-z0-9_]+)/g)].map(
      (match) => match[1],
    ),
  );
  return [...new Set(names)].filter((name) => name !== "GITHUB_TOKEN").sort();
}

test("flags a deployment secret assigned a random-looking value, in any assignment form", async () => {
  await withTempRepo(async (dir) => {
    trackFile(dir, "railway.sh", `RAILWAY_TOKEN=${UUID_SHAPED_VALUE}\n`);
    trackFile(dir, "mail.yml", `env:\n  RESEND_API_KEY: "${MIXED_32_CHAR_VALUE}"\n`);

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.deepEqual(violations.map(({ path, line }) => `${path}:${line}`).sort(), [
      "mail.yml:2",
      "railway.sh:1",
    ]);
  });
});

test("accepts deployment secret names holding a readable fake or a workflow secret reference", async () => {
  await withTempRepo(async (dir) => {
    trackFile(
      dir,
      "fakes.yml",
      [
        "EDGE_ORIGIN_SECRET=local-edge-secret",
        'RESEND_API_KEY: "re_test_key"',
        'CLOUD_APP_DATABASE_PASSWORD: "unused-a-fake-sender-is-injected-below"',
        `RAILWAY_TOKEN: \${{ secrets.RAILWAY_TOKEN }}`,
      ].join("\n"),
    );

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.deepEqual(violations, []);
  });
});

test("every secret a workflow reads is covered by the deployment secret check", async () => {
  const names = workflowSecretNames();
  assert.ok(names.length > 0, "expected the workflows to read at least one secret");

  await withTempRepo(async (dir) => {
    trackFile(
      dir,
      "secrets.env.sh",
      names.map((name) => `${name}=${UUID_SHAPED_VALUE}`).join("\n"),
    );

    const files = findTrackedFiles(dir);
    const violations = await checkFiles(files, { cwd: dir, configFilePath: repoConfigFilePath });

    assert.deepEqual(
      violations.map((violation) => violation.line).sort((a, b) => a - b),
      names.map((_, index) => index + 1),
      `every secret a workflow reads must be listed in the deployment secret pattern: ${names.join(", ")}`,
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
