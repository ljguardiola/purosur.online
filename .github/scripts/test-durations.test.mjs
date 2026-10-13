import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  decodeDurations,
  durationBalancedSequencer,
  durationKey,
  encodeDurations,
  readDurations,
  shardPlan,
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

function shardEntries(entries, durations, position) {
  return shardPlan(entries, durations, position).entries;
}

function keysOf(entries) {
  return entries.map((e) => e.key);
}

function shardLoads(entries, durations, count) {
  return Array.from({ length: count }, (_, i) =>
    shardEntries(entries, durations, { index: i + 1, count }).reduce(
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
    keysOf(shardEntries(entries, durations, { index, count: 4 })),
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

test("gives every shard a share of each project, whatever another project weighs", () => {
  const heavy = entry("browser", "screen.test.tsx");
  const light = ["a", "b", "c"].map((f) => entry("node", `${f}.test.ts`));
  const durations = Object.fromEntries([[heavy.key, 300], ...light.map((e) => [e.key, 100])]);

  const nodeFilesPerShard = [1, 2].map(
    (index) =>
      shardEntries([heavy, ...light], durations, { index, count: 2 }).filter(
        (e) => e.project === "node",
      ).length,
  );

  assert.deepEqual(nodeFilesPerShard.sort(), [1, 2]);
});

test("spreads projects of a single file over different shards", () => {
  const builds = ["backoffice-build", "register-build", "served-backoffice"].map((project) =>
    entry(project, `${project}.test.ts`),
  );
  const durations = Object.fromEntries(builds.map((e, i) => [e.key, [28_000, 15_000, 9_000][i]]));
  const node = Array.from({ length: 6 }, (_, i) => entry("node", `f${i}.test.ts`));

  const buildsPerShard = [1, 2, 3].map(
    (index) =>
      shardEntries([...builds, ...node], durations, { index, count: 3 }).filter(
        (e) => e.project !== "node",
      ).length,
  );

  assert.deepEqual(buildsPerShard, [1, 1, 1]);
});

function estimatedLoads(entries, durations, count) {
  return Array.from(
    { length: count },
    (_, i) => shardPlan(entries, durations, { index: i + 1, count }).estimatedMs,
  );
}

test("evens out the total load when each project splits evenly", () => {
  const cloud = ["a", "b"].map((f) => entry("cloud-integration", `${f}.test.ts`));
  const node = ["c", "d"].map((f) => entry("node", `${f}.test.ts`));
  const durations = Object.fromEntries(
    [...cloud, ...node].map((e, i) => [e.key, [100, 1, 100, 1][i]]),
  );

  assert.deepEqual(estimatedLoads([...cloud, ...node], durations, 2), [101, 101]);
});

test("puts the second single-file project on the shard the first one left lighter", () => {
  const first = entry("a-build", "a-build.test.ts");
  const node = ["c", "d", "e"].map((f) => entry("node", `${f}.test.ts`));
  const last = entry("z-build", "z-build.test.ts");
  const entries = [first, ...node, last];
  const durations = Object.fromEntries(
    entries.map((e, i) => [e.key, [28_000, 100, 100, 1, 27_000][i]]),
  );

  assert.deepEqual(estimatedLoads(entries, durations, 2), [28_100, 27_101]);
});

test("gives the same shards whatever the order of the entries", () => {
  const entries = Array.from({ length: 9 }, (_, i) => entry("node", `f${i}.test.ts`));
  const durations = Object.fromEntries(entries.map((e, i) => [e.key, (i % 3) * 10 + 5]));

  for (const index of [1, 2, 3]) {
    const forward = shardEntries(entries, durations, { index, count: 3 });
    const backward = shardEntries([...entries].reverse(), durations, { index, count: 3 });
    assert.deepEqual(keysOf(backward), keysOf(forward));
  }
});

test("weighs a file with no duration as the mean of its own project", () => {
  const known = [
    entry("slow", "a.test.ts"),
    entry("slow", "b.test.ts"),
    entry("fast", "c.test.ts"),
    entry("fast", "d.test.ts"),
    entry("fast", "e.test.ts"),
  ];
  const unknownSlow = entry("slow", "new.test.ts");
  const durations = Object.fromEntries(known.map((e, i) => [e.key, [1000, 600, 20, 20, 20][i]]));

  const plan = shardPlan([...known, unknownSlow], durations, { index: 1, count: 1 });

  assert.equal(plan.estimatedMs, 1660 + 800);
});

test("weighs a file whose project has no duration as the mean of all known durations", () => {
  const known = [entry("one", "a.test.ts"), entry("one", "b.test.ts"), entry("three", "c.test.ts")];
  const stranger = entry("two", "x.test.ts");
  const durations = Object.fromEntries(known.map((e, i) => [e.key, [300, 100, 500][i]]));

  const plan = shardPlan([...known, stranger], durations, { index: 1, count: 1 });

  assert.equal(plan.estimatedMs, 900 + 300);
});

test("balances by count when no duration is known at all", () => {
  const entries = Array.from({ length: 10 }, (_, i) => entry("node", `f${i}.test.ts`));

  const sizes = [1, 2, 3].map((index) => shardEntries(entries, {}, { index, count: 3 }).length);

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

    await reporter.onTestRunEnd([
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

  await assert.doesNotReject(reporter.onTestRunEnd([moduleWith("node", "a.test.ts", undefined)]));
});

function fakeContext(shard, root = "/repo") {
  const logs = [];
  return { logs, ctx: { config: { root, shard }, logger: { log: (m) => logs.push(m) } } };
}

function spec(project, moduleId) {
  return { project: { name: project }, moduleId };
}

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

test("the sequencer keeps the specs of the configured shard, balanced by the measured durations", async () => {
  const payload = encodeDurations({
    "node:a.test.ts": 100,
    "node:b.test.ts": 100,
    "node:c.test.ts": 10,
  });
  const specs = ["a", "b", "c"].map((f) => spec("node", `/repo/${f}.test.ts`));
  const Sequencer = durationBalancedSequencer(payload);

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

for (const [label, payload] of [
  ["measured durations", encodeDurations({ "node:f0.test.ts": 900, "node:f3.test.ts": 40 })],
  ["no durations", ""],
]) {
  test(`the sequencer of every shard, given the same ${label}, runs each file exactly once`, async () => {
    const specs = Array.from({ length: 23 }, (_, i) => spec("node", `/repo/f${i}.test.ts`));
    const Sequencer = durationBalancedSequencer(payload);

    const ran = [];
    for (let index = 1; index <= 6; index++) {
      const { ctx } = fakeContext({ index, count: 6 });
      ran.push(...(await new Sequencer(ctx).shard(specs)).map((s) => s.moduleId));
    }

    assert.deepEqual(ran.sort(), specs.map((s) => s.moduleId).sort());
  });
}

test("the sequencer says it runs without durations when it has none", async () => {
  const specs = ["a", "b", "c"].map((f) => spec("node", `/repo/${f}.test.ts`));
  const { ctx, logs } = fakeContext({ index: 1, count: 2 });

  await new (durationBalancedSequencer(undefined))(ctx).shard(specs);

  assert.equal(logs.length, 1);
  assert.match(logs[0], /shard 1\/2 runs 2 files without durations, split by file count/);
});

test("the sequencer names no missing durations when it has them", async () => {
  const specs = ["a", "b"].map((f) => spec("node", `/repo/${f}.test.ts`));
  const { ctx, logs } = fakeContext({ index: 1, count: 2 });

  await new (durationBalancedSequencer(encodeDurations({ "node:a.test.ts": 5 })))(ctx).shard(specs);

  assert.doesNotMatch(logs[0], /without durations/);
});
