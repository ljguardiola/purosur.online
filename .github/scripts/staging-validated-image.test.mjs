import assert from "node:assert/strict";
import { test } from "node:test";
import {
  digestImageRef,
  runCli,
  stagingValidatedImage,
  stagingValidatedTag,
} from "./staging-validated-image.mjs";

const SHA = "a1".repeat(20);
const DIGEST = `sha256:${"b".repeat(64)}`;

test("names the tag only a staging-verified digest carries after the commit it was built from", () => {
  assert.equal(stagingValidatedTag(SHA), `staging-validated-${SHA}`);
});

test("lowercases the commit", () => {
  assert.equal(stagingValidatedTag(SHA.toUpperCase()), `staging-validated-${SHA}`);
});

test("refuses a commit that is not 40 hexadecimal characters", () => {
  for (const sha of ["", "abc", `${SHA}0`, "g".repeat(40), undefined, "main"]) {
    assert.throws(() => stagingValidatedTag(sha), /40/);
  }
});

test("names the image in the registry", () => {
  assert.equal(
    stagingValidatedImage(SHA),
    `ghcr.io/ljguardiola/purosur-cloud:staging-validated-${SHA}`,
  );
});

test("turns an inspected manifest into a digest reference", () => {
  assert.equal(
    digestImageRef(
      JSON.stringify({
        mediaType: "application/vnd.oci.image.index.v1+json",
        digest: DIGEST,
        size: 1234,
      }),
    ),
    `ghcr.io/ljguardiola/purosur-cloud@${DIGEST}`,
  );
});

test("refuses anything that is not a sha256 digest", () => {
  const refusals = [
    JSON.stringify({ digest: "sha256:abc" }),
    JSON.stringify({ digest: `sha512:${"b".repeat(64)}` }),
    JSON.stringify({ digest: `${DIGEST}\nextra` }),
    JSON.stringify({ digest: `sha256:${"B".repeat(64)}` }),
    JSON.stringify({ digest: 7 }),
    JSON.stringify({}),
    JSON.stringify([DIGEST]),
    JSON.stringify(null),
    "not json",
    "",
  ];
  for (const manifest of refusals) {
    assert.throws(() => digestImageRef(manifest), /digest/, manifest);
  }
});

function fakeCli({ argv, env = {}, files = {} }) {
  const calls = { outputs: [], logs: [], errors: [] };
  return {
    calls,
    deps: {
      argv,
      env: { GITHUB_OUTPUT: "/output", ...env },
      readFile: async (path) => {
        if (!(path in files)) throw new Error(`no such file ${path}`);
        return files[path];
      },
      appendOutput: async (path, text) => calls.outputs.push({ path, text }),
      log: (message) => calls.logs.push(message),
      logError: (message) => calls.errors.push(message),
    },
  };
}

test("the tag command writes the validated image's reference", async () => {
  const { deps, calls } = fakeCli({ argv: ["tag"], env: { TARGET_SHA: SHA } });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.outputs, [
    { path: "/output", text: `image=ghcr.io/ljguardiola/purosur-cloud:staging-validated-${SHA}\n` },
  ]);
});

test("the digest command writes the digest reference of the manifest file", async () => {
  const { deps, calls } = fakeCli({
    argv: ["digest"],
    env: { MANIFEST_FILE: "/manifest.json" },
    files: { "/manifest.json": JSON.stringify({ digest: DIGEST }) },
  });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.outputs, [
    { path: "/output", text: `image_ref=ghcr.io/ljguardiola/purosur-cloud@${DIGEST}\n` },
  ]);
});

test("the digest command fails on a manifest without a digest", async () => {
  const { deps, calls } = fakeCli({
    argv: ["digest"],
    env: { MANIFEST_FILE: "/manifest.json" },
    files: { "/manifest.json": "{}" },
  });

  assert.equal(await runCli(deps), 1);
  assert.deepEqual(calls.outputs, []);
  assert.match(calls.errors.join("\n"), /digest/);
});

test("the commands fail without their inputs", async () => {
  for (const argv of [[], ["tag"], ["digest"], ["unknown"]]) {
    const { deps, calls } = fakeCli({ argv });
    assert.equal(await runCli(deps), 1, argv.join(" "));
    assert.notEqual(calls.errors.length, 0);
  }
});
