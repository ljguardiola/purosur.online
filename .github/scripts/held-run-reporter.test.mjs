import assert from "node:assert/strict";
import { test } from "node:test";
import { HeldRunReporter } from "./held-run-reporter.mjs";

const GRACE_MS = 60_000;
const STALL_MS = 300_000;
const ROOT = "/repo";

function fakeVitest({ watch = false, openPages = {}, unhandledErrors = [], reporters = [] } = {}) {
  return {
    config: { root: ROOT, watch },
    projects: ["node", "browser"].map((name) => ({
      name,
      browser:
        name in openPages
          ? { state: { orchestrators: new Map(openPages[name].map((id) => [id, {}])) } }
          : undefined,
    })),
    state: { getUnhandledErrors: () => unhandledErrors },
    reporters,
  };
}

function spec(project, file) {
  return { moduleId: `${ROOT}/${file}`, project: { name: project } };
}

function finishedModule(project, file, state = "passed") {
  return { moduleId: `${ROOT}/${file}`, project: { name: project }, state: () => state };
}

class OrderPreservingSequencer {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async shard(files) {
    return files;
  }

  async sort(files) {
    return files;
  }
}

function endingReporter(name, calls) {
  return {
    onTestRunEnd: async (modules, errors, state) => {
      calls.push({ name, files: modules.map((m) => m.moduleId), errors, state });
    },
  };
}

async function startedReporter(vitest, specs, { executed = specs, exit } = {}) {
  const lines = [];
  const exits = [];
  const reporter = new HeldRunReporter({
    graceMs: GRACE_MS,
    stallMs: STALL_MS,
    log: (line) => lines.push(line),
    exit: exit ?? ((code) => exits.push(code)),
  });
  vitest.reporters.push(reporter);
  reporter.onInit(vitest);
  reporter.onTestRunStart(specs);
  const Sequencer = reporter.trackExecutedFiles(OrderPreservingSequencer);
  await new Sequencer(vitest).sort(executed);
  return { reporter, lines, exits };
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

test("ends a run whose files all passed with a passing result once the grace period passes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = await startedReporter(fakeVitest(), [spec("node", "a.test.ts")]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(GRACE_MS - 1);
  await settle();
  assert.deepEqual(exits, []);

  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(exits, [0]);
});

test("ends a held run with a failing result when one of its files failed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = await startedReporter(fakeVitest(), [
    spec("node", "a.test.ts"),
    spec("browser", "b.test.tsx"),
  ]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts", "failed"));
  reporter.onTestModuleEnd(finishedModule("browser", "b.test.tsx"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  assert.deepEqual(exits, [1]);
});

test("ends a held run with a failing result when the run caught an unhandled error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits, lines } = await startedReporter(
    fakeVitest({ unhandledErrors: [new Error("x")] }),
    [spec("node", "a.test.ts")],
  );

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  assert.deepEqual(exits, [1]);
  assert.match(
    lines.join("\n"),
    /ending with the tests' own result: failed \(1 files, 0 failed, 1 unhandled error\)/,
  );
});

test("leaves a run that ends within the grace period to end by itself", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits, lines } = await startedReporter(fakeVitest(), [
    spec("node", "a.test.ts"),
  ]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  reporter.onTestRunEnd();
  t.mock.timers.tick(GRACE_MS + STALL_MS);
  await settle();

  assert.deepEqual(exits, []);
  assert.deepEqual(lines, []);
});

test("never ends a run while one of its files has not reported", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = await startedReporter(fakeVitest(), [
    spec("node", "a.test.ts"),
    spec("browser", "b.test.tsx"),
  ]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(10 * STALL_MS);
  await settle();

  assert.deepEqual(exits, []);
});

test("names the browser pages still open when it ends a held run", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, lines } = await startedReporter(
    fakeVitest({ openPages: { browser: ["s1", "s2"] } }),
    [spec("browser", "b.test.tsx")],
  );

  reporter.onTestModuleEnd(finishedModule("browser", "b.test.tsx"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  const output = lines.join("\n");
  assert.match(output, /every test file reported 60s ago and Vitest has not ended/);
  assert.match(output, /"browser" still has 2 browser pages open: s1, s2/);
  assert.match(output, /ending with the tests' own result: passed \(1 files, 0 failed\)/);
});

test("says no browser page is open when none holds the run", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, lines } = await startedReporter(fakeVitest({ openPages: { browser: [] } }), [
    spec("node", "a.test.ts"),
  ]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  assert.match(lines.join("\n"), /no browser page is open/);
});

test("gives every other reporter the end of a held run before ending it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const calls = [];
  const order = [];
  const error = new Error("x");
  const vitest = fakeVitest({
    unhandledErrors: [error],
    reporters: [endingReporter("default", calls), endingReporter("slow-tests", calls)],
  });
  const { reporter } = await startedReporter(vitest, [spec("node", "a.test.ts")], {
    exit: () => order.push(calls.length),
  });
  let ownEnds = 0;
  reporter.onTestRunEnd = () => {
    ownEnds++;
  };

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts", "failed"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  const ended = { files: [`${ROOT}/a.test.ts`], errors: [error], state: "failed" };
  assert.deepEqual(calls, [
    { name: "default", ...ended },
    { name: "slow-tests", ...ended },
  ]);
  assert.equal(ownEnds, 0);
  assert.deepEqual(order, [2]);
});

test("waits only on the files this shard runs when the run starts with every shard's files", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = await startedReporter(
    fakeVitest(),
    [spec("node", "a.test.ts"), spec("node", "b.test.ts"), spec("browser", "c.test.tsx")],
    { executed: [spec("node", "a.test.ts")] },
  );

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  assert.deepEqual(exits, [0]);
});

test("names only this shard's files when one of its projects stalls", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { lines } = await startedReporter(
    fakeVitest(),
    [spec("node", "a.test.ts"), spec("node", "b.test.ts"), spec("browser", "c.test.tsx")],
    { executed: [spec("node", "a.test.ts")] },
  );

  t.mock.timers.tick(STALL_MS);
  await settle();

  assert.deepEqual(lines, [
    'held-run: no "node" test file finished in the last 300s; 1 still to report: a.test.ts',
  ]);
});

test("names a project none of whose remaining files finished within the stall period", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, lines } = await startedReporter(
    fakeVitest({ openPages: { browser: ["s1"] } }),
    [
      spec("node", "a.test.ts"),
      spec("node", "b.test.ts"),
      spec("node", "c.test.ts"),
      spec("browser", "x.test.tsx"),
      spec("browser", "y.test.tsx"),
    ],
  );

  t.mock.timers.tick(STALL_MS / 2);
  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(STALL_MS / 2);
  reporter.onTestModuleEnd(finishedModule("node", "b.test.ts"));
  t.mock.timers.tick(STALL_MS);
  await settle();

  assert.deepEqual(lines, [
    'held-run: no "browser" test file finished in the last 300s; 2 still to report: ' +
      'x.test.tsx, y.test.tsx; "browser" has 1 browser page open: s1',
  ]);
});

test("names at most ten of a stalled project's remaining files", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const files = Array.from({ length: 12 }, (_, i) => `f${String(i).padStart(2, "0")}.test.ts`);
  const { lines } = await startedReporter(
    fakeVitest(),
    files.map((file) => spec("node", file)),
  );

  t.mock.timers.tick(STALL_MS);
  await settle();

  assert.equal(lines.length, 1);
  assert.match(lines[0], /12 still to report: f00\.test\.ts, .*f09\.test\.ts and 2 more$/);
});

test("arms nothing in watch mode", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits, lines } = await startedReporter(fakeVitest({ watch: true }), [
    spec("node", "a.test.ts"),
    spec("node", "b.test.ts"),
  ]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(10 * STALL_MS);
  reporter.onTestModuleEnd(finishedModule("node", "b.test.ts"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  assert.deepEqual(exits, []);
  assert.deepEqual(lines, []);
});

test("stops watching once the run ends", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, lines } = await startedReporter(fakeVitest(), [spec("node", "a.test.ts")]);

  reporter.onTestRunEnd();
  t.mock.timers.tick(10 * STALL_MS);
  await settle();

  assert.deepEqual(lines, []);
});
