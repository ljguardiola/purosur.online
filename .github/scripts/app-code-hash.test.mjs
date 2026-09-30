import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  compareHashes,
  differingFiles,
  hashAsarFile,
  validatePathCount,
} from "./app-code-hash.mjs";
import { asarArchive } from "./asar-archive-fixture.mjs";

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

async function differingFilesBetween(dir, firstFiles, secondFiles) {
  const first = join(dir, "first.asar");
  const second = join(dir, "second.asar");
  await writeFile(first, asarArchive(firstFiles));
  await writeFile(second, asarArchive(secondFiles));
  return differingFiles(first, second);
}

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
    first: "a.asar",
    mismatch: "b.asar",
  });
});

test("differingFiles names a packed file whose content differs", async () => {
  await withTempDir(async (dir) => {
    const result = await differingFilesBetween(
      dir,
      { "package.json": { content: "{}" }, "out/main/index.js": { content: "one" } },
      { "package.json": { content: "{}" }, "out/main/index.js": { content: "two" } },
    );

    assert.deepEqual(result, { ok: true, files: ["out/main/index.js"] });
  });
});

test("differingFiles names a packed file whose bytes differ under the same recorded hash", async () => {
  await withTempDir(async (dir) => {
    const result = await differingFilesBetween(
      dir,
      { "out/main/index.js": { content: "one", recordedHash: "recorded" } },
      { "out/main/index.js": { content: "two", recordedHash: "recorded" } },
    );

    assert.deepEqual(result, { ok: true, files: ["out/main/index.js"] });
  });
});

test("differingFiles names an unpacked file whose recorded hash differs", async () => {
  await withTempDir(async (dir) => {
    const result = await differingFilesBetween(
      dir,
      { "node_modules/native/build/state": { unpackedHash: "aaa" } },
      { "node_modules/native/build/state": { unpackedHash: "bbb" } },
    );

    assert.deepEqual(result, { ok: true, files: ["node_modules/native/build/state"] });
  });
});

test("differingFiles names the files only one archive holds", async () => {
  await withTempDir(async (dir) => {
    const result = await differingFilesBetween(
      dir,
      { "package.json": { content: "{}" }, "out/a.js": { content: "a" } },
      { "package.json": { content: "{}" }, "out/b.js": { content: "b" } },
    );

    assert.deepEqual(result, { ok: true, files: ["out/a.js", "out/b.js"] });
  });
});

test("differingFiles names no file when the same files sit at other offsets", async () => {
  await withTempDir(async (dir) => {
    const result = await differingFilesBetween(
      dir,
      { "out/a.js": { content: "a" }, "out/b.js": { content: "bb" } },
      { "out/b.js": { content: "bb" }, "out/a.js": { content: "a" } },
    );

    assert.deepEqual(result, { ok: true, files: [] });
  });
});

test("differingFiles names an empty directory only one archive holds", async () => {
  await withTempDir(async (dir) => {
    const result = await differingFilesBetween(
      dir,
      { "package.json": { content: "{}" }, "out/cache": { directory: true } },
      { "package.json": { content: "{}" } },
    );

    assert.deepEqual(result, { ok: true, files: ["out", "out/cache"] });
  });
});

test("differingFiles reports a first file that is not an asar archive", async () => {
  await withTempDir(async (dir) => {
    const first = join(dir, "first.asar");
    const second = join(dir, "second.asar");
    await writeFile(first, "not an archive");
    await writeFile(second, asarArchive({ "package.json": { content: "{}" } }));

    const result = await differingFiles(first, second);

    assert.deepEqual(result, { ok: false, reason: `${first} is not a readable asar archive` });
  });
});

test("differingFiles reports a second file that is not an asar archive", async () => {
  await withTempDir(async (dir) => {
    const first = join(dir, "first.asar");
    const second = join(dir, "second.asar");
    await writeFile(first, asarArchive({ "package.json": { content: "{}" } }));
    await writeFile(second, "not an archive");

    const result = await differingFiles(first, second);

    assert.deepEqual(result, { ok: false, reason: `${second} is not a readable asar archive` });
  });
});
