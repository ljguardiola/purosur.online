import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { decodeDurations, encodeDurations, readDurations } from "./test-durations-payload.mjs";

async function inScratchDir(body) {
  const dir = await mkdtemp(join(tmpdir(), "test-durations-payload-"));
  try {
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("reads and merges every json file under a directory, nested ones included", async () => {
  await inScratchDir(async (dir) => {
    await mkdir(join(dir, "test-durations-shard-1"), { recursive: true });
    await writeFile(join(dir, "test-durations-shard-1", "shard-1.json"), '{"a:x":1,"a:y":2}');
    await writeFile(join(dir, "top.json"), '{"b:z":3}');
    await writeFile(join(dir, "notes.txt"), "not json");

    assert.deepEqual(await readDurations(dir), { "a:x": 1, "a:y": 2, "b:z": 3 });
  });
});

test("reads no durations from an unset or missing directory", async () => {
  assert.deepEqual(await readDurations(undefined), {});
  await inScratchDir(async (dir) => {
    assert.deepEqual(await readDurations(join(dir, "missing")), {});
  });
});

test("refuses a json file that is not an object of numbers", async () => {
  for (const content of ["[1,2]", "null", '{"a":"slow"}', "{not json"]) {
    await inScratchDir(async (dir) => {
      await writeFile(join(dir, "bad.json"), content);
      await assert.rejects(readDurations(dir));
    });
  }
});

test("decodes encoded durations to the same durations", () => {
  const durations = { "node:a.test.ts": 100, "browser:b.test.tsx": 2 };

  assert.deepEqual(decodeDurations(encodeDurations(durations)), durations);
});

test("decodes no durations from an unset or empty payload", () => {
  assert.deepEqual(decodeDurations(undefined), {});
  assert.deepEqual(decodeDurations(""), {});
});

test("refuses a payload that does not decode to an object of numbers", () => {
  for (const payload of [
    "not base64 gzip",
    gzipSync("[1,2]").toString("base64"),
    gzipSync('{"a":"slow"}').toString("base64"),
    gzipSync("{not json").toString("base64"),
  ]) {
    assert.throws(() => decodeDurations(payload));
  }
});
