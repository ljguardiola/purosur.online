import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compareHashes, hashAsarFile, validatePathCount } from "./app-code-hash.mjs";

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "app-code-hash-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function sha256Of(content) {
  return createHash("sha256").update(content).digest("hex");
}

// validatePathCount -------------------------------------------------------------

test("validatePathCount rejects zero paths", () => {
  assert.deepEqual(validatePathCount([]), {
    ok: false,
    reason: "at least two app.asar paths are required, got 0",
  });
});

test("validatePathCount rejects a single path", () => {
  assert.deepEqual(validatePathCount(["only.asar"]), {
    ok: false,
    reason: "at least two app.asar paths are required, got 1",
  });
});

test("validatePathCount accepts two or more paths", () => {
  assert.deepEqual(validatePathCount(["a.asar", "b.asar"]), { ok: true });
  assert.deepEqual(validatePathCount(["a.asar", "b.asar", "c.asar"]), { ok: true });
});

// hashAsarFile -------------------------------------------------------------

test("hashAsarFile hashes a file's content with sha256", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "app.asar");
    const content = "some packaged app code";
    await writeFile(filePath, content);

    const result = await hashAsarFile(filePath);

    assert.deepEqual(result, { ok: true, hash: sha256Of(content) });
  });
});

test("hashAsarFile reports a missing file", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "missing.asar");

    const result = await hashAsarFile(filePath);

    assert.deepEqual(result, { ok: false, reason: `${filePath} does not exist` });
  });
});

test("hashAsarFile reports an empty file", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "empty.asar");
    await writeFile(filePath, "");

    const result = await hashAsarFile(filePath);

    assert.deepEqual(result, { ok: false, reason: `${filePath} is empty` });
  });
});

// compareHashes -------------------------------------------------------------

test("compareHashes accepts when every entry shares the same hash", () => {
  const entries = [
    { path: "a.asar", hash: "same" },
    { path: "b.asar", hash: "same" },
    { path: "c.asar", hash: "same" },
  ];

  assert.deepEqual(compareHashes(entries), { ok: true });
});

test("compareHashes rejects the first entry that differs from the first hash", () => {
  const entries = [
    { path: "a.asar", hash: "aaa" },
    { path: "b.asar", hash: "bbb" },
  ];

  assert.deepEqual(compareHashes(entries), {
    ok: false,
    reason: "app.asar differs: a.asar (aaa) vs b.asar (bbb)",
  });
});
