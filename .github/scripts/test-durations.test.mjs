import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  balancedShard,
  durationBalancedSequencer,
  durationKey,
  readDurations,
  TestDurationsReporter,
} from "./test-durations.mjs";

async function inScratchDir(body) {
  const dir = await mkdtemp(join(tmpdir(), "test-durations-"));
  try {
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function entry(project, file) {
  return { key: durationKey(project, file), project };
}

function keysOf(entries) {
  return entries.map((e) => e.key);
}

function shardLoads(entries, durations, count) {
  return Array.from({ length: count }, (_, i) =>
    balancedShard(entries, durations, { index: i + 1, count }).reduce(
      (sum, e) => sum + durations[e.key],
      0,
    ),
  );
}

test("builds the key from the project and the posix relative path", () => {
  assert.equal(durationKey("node", "apps/cloud/src/a.test.ts"), "node:apps/cloud/src/a.test.ts");
  assert.equal(durationKey("node", "apps\\cloud\\a.test.ts"), "node:apps/cloud/a.test.ts");
});

test("puts every entry in exactly one shard", () => {
  const entries = Array.from({ length: 11 }, (_, i) => entry("node", `f${i}.test.ts`));
  const durations = { [entries[0].key]: 900, [entries[3].key]: 40 };

  const all = [1, 2, 3, 4].flatMap((index) =>
    keysOf(balancedShard(entries, durations, { index, count: 4 })),
  );

  assert.deepEqual(all.sort(), keysOf(entries).sort());
});

test("evens out the load where splitting by count would not", () => {
  const entries = ["a", "b", "c", "d", "e", "f"].map((f) => entry("node", `${f}.test.ts`));
  const durations = Object.fromEntries(
    entries.map((e, i) => [e.key, [100, 90, 10, 10, 10, 80][i]]),
  );

  const loads = shardLoads(entries, durations, 3);

  assert.deepEqual(loads.sort(), [100, 100, 100]);
});

test("gives the same shards whatever the order of the entries", () => {
  const entries = Array.from({ length: 9 }, (_, i) => entry("node", `f${i}.test.ts`));
  const durations = Object.fromEntries(entries.map((e, i) => [e.key, (i % 3) * 10 + 5]));

  for (const index of [1, 2, 3]) {
    const forward = balancedShard(entries, durations, { index, count: 3 });
    const backward = balancedShard([...entries].reverse(), durations, { index, count: 3 });
    assert.deepEqual(keysOf(backward), keysOf(forward));
  }
});

test("weighs a file with no duration as the mean of its own project", () => {
  const known = [
    entry("slow", "a.test.ts"),
    entry("slow", "b.test.ts"),
    entry("fast", "c.test.ts"),
  ];
  const unknownSlow = entry("slow", "new.test.ts");
  const durations = { [known[0].key]: 1000, [known[1].key]: 1000, [known[2].key]: 10 };

  const shards = [1, 2].map((index) =>
    keysOf(balancedShard([...known, unknownSlow], durations, { index, count: 2 })),
  );

  const shardWithNew = shards.find((s) => s.includes(unknownSlow.key));
  assert.deepEqual(shardWithNew.length, 2);
  assert.ok(!shardWithNew.includes(known[2].key));
});

test("weighs a file whose project has no duration as the mean of all known durations", () => {
  const a = entry("one", "a.test.ts");
  const b = entry("one", "b.test.ts");
  const stranger = entry("two", "x.test.ts");
  const durations = { [a.key]: 300, [b.key]: 100 };

  const shards = [1, 2].map((index) =>
    keysOf(balancedShard([a, b, stranger], durations, { index, count: 2 })),
  );

  assert.deepEqual(shards.map((s) => s.length).sort(), [1, 2]);
  const alone = shards.find((s) => s.length === 1);
  assert.deepEqual(alone, [a.key]);
});

test("balances by count when no duration is known at all", () => {
  const entries = Array.from({ length: 10 }, (_, i) => entry("node", `f${i}.test.ts`));

  const sizes = [1, 2, 3].map((index) => balancedShard(entries, {}, { index, count: 3 }).length);

  assert.deepEqual(sizes.sort(), [3, 3, 4]);
});

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

function moduleWith(project, relativeModuleId, diagnostic) {
  return { project: { name: project }, relativeModuleId, diagnostic: () => diagnostic };
}

test("writes each module's total duration, rounded, under its key", async () => {
  await inScratchDir(async (dir) => {
    const outputFile = join(dir, "nested", "out", "shard-1.json");
    const reporter = new TestDurationsReporter({ outputFile });

    reporter.onTestRunEnd([
      moduleWith("node", "a.test.ts", {
        duration: 100.4,
        collectDuration: 200,
        setupDuration: 3,
        prepareDuration: 4,
        environmentSetupDuration: 5,
      }),
      moduleWith("browser", "b.test.tsx", {
        duration: 10,
        collectDuration: 0,
        setupDuration: 0,
        prepareDuration: 0,
        environmentSetupDuration: 0,
      }),
    ]);

    assert.deepEqual(JSON.parse(await readFile(outputFile, "utf8")), {
      "node:a.test.ts": 312,
      "browser:b.test.tsx": 10,
    });
  });
});

test("writes nothing without an output file", async () => {
  const reporter = new TestDurationsReporter({ outputFile: undefined });

  assert.doesNotThrow(() => reporter.onTestRunEnd([moduleWith("node", "a.test.ts", undefined)]));
});

function fakeContext(shard, root = "/repo") {
  const logs = [];
  return { logs, ctx: { config: { root, shard }, logger: { log: (m) => logs.push(m) } } };
}

function spec(project, moduleId) {
  return { project: { name: project }, moduleId };
}

test("the sequencer keeps the specs of the configured shard, balanced by the measured durations", async () => {
  await inScratchDir(async (dir) => {
    await writeFile(
      join(dir, "d.json"),
      JSON.stringify({ "node:a.test.ts": 100, "node:b.test.ts": 100, "node:c.test.ts": 10 }),
    );
    const specs = ["a", "b", "c"].map((f) => spec("node", `/repo/${f}.test.ts`));
    const Sequencer = durationBalancedSequencer(dir);

    const first = fakeContext({ index: 1, count: 2 });
    const second = fakeContext({ index: 2, count: 2 });
    const one = await new Sequencer(first.ctx).shard(specs);
    const two = await new Sequencer(second.ctx).shard(specs);

    assert.deepEqual(one.map((s) => s.moduleId).sort(), ["/repo/a.test.ts", "/repo/c.test.ts"]);
    assert.deepEqual(
      two.map((s) => s.moduleId),
      ["/repo/b.test.ts"],
    );
    assert.equal(first.logs.length, 1);
    assert.match(first.logs[0], /shard 1\/2/);
  });
});
