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

function startedModule(project, file) {
  return { moduleId: `${ROOT}/${file}`, project: { name: project } };
}

function finishedTest(project, file) {
  return { project: { name: project }, module: startedModule(project, file) };
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

test("ends the run with a failure when a running file finishes no test within the stall period", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = await startedReporter(fakeVitest(), [spec("browser", "b.test.tsx")]);

  reporter.onTestModuleQueued(startedModule("browser", "b.test.tsx"));
  reporter.onTestCaseResult(finishedTest("browser", "b.test.tsx"));
  t.mock.timers.tick(STALL_MS - 1);
  await settle();
  assert.deepEqual(exits, []);

  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(exits, [1]);
});

test("ends the run when a file hangs before its first test finishes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits, lines } = await startedReporter(fakeVitest(), [
    spec("node", "a.test.ts"),
    spec("node", "b.test.ts"),
  ]);

  t.mock.timers.tick(STALL_MS / 2);
  reporter.onTestModuleQueued(startedModule("node", "a.test.ts"));
  t.mock.timers.tick(STALL_MS - 1);
  await settle();
  assert.deepEqual(exits, []);

  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(exits, [1]);
  assert.match(lines.join("\n"), /no "node" test finished in the last 300s while one of its files ran/);
});

test("never ends a file whose tests keep finishing, however long the file takes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits, lines } = await startedReporter(fakeVitest(), [
    spec("browser", "slow.test.tsx"),
  ]);

  reporter.onTestModuleQueued(startedModule("browser", "slow.test.tsx"));
  for (let i = 0; i < 10; i++) {
    t.mock.timers.tick(STALL_MS - 1);
    reporter.onTestCaseResult(finishedTest("browser", "slow.test.tsx"));
  }
  await settle();

  assert.deepEqual(exits, []);
  assert.deepEqual(lines, []);
});

test("never ends a project whose files only wait for a worker while others keep finishing tests", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits, lines } = await startedReporter(fakeVitest(), [
    spec("node", "a.test.ts"),
    spec("browser", "waiting.test.tsx"),
  ]);

  reporter.onTestModuleQueued(startedModule("node", "a.test.ts"));
  for (let i = 0; i < 10; i++) {
    t.mock.timers.tick(STALL_MS - 1);
    reporter.onTestCaseResult(finishedTest("node", "a.test.ts"));
  }
  await settle();

  assert.deepEqual(exits, []);
  assert.deepEqual(lines, []);
});

test("ends the run when one project's running file stalls while another project keeps finishing tests", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = await startedReporter(fakeVitest(), [
    spec("node", "a.test.ts"),
    spec("browser", "stuck.test.tsx"),
  ]);

  reporter.onTestModuleQueued(startedModule("node", "a.test.ts"));
  reporter.onTestModuleQueued(startedModule("browser", "stuck.test.tsx"));
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(STALL_MS / 3);
    reporter.onTestCaseResult(finishedTest("node", "a.test.ts"));
  }
  await settle();

  assert.deepEqual(exits, [1]);
});

test("ends the run when nothing in it progresses within the stall period while a file never started", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits, lines } = await startedReporter(
    fakeVitest({ openPages: { browser: ["s1"] } }),
    [spec("node", "a.test.ts"), spec("browser", "never-started.test.tsx")],
  );

  reporter.onTestModuleQueued(startedModule("node", "a.test.ts"));
  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(STALL_MS - 1);
  await settle();
  assert.deepEqual(exits, []);

  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(exits, [1]);
  assert.deepEqual(lines, [
    "held-run: no test finished and no test file started in the last 300s",
    'held-run: 1 "browser" file still to report: never-started.test.tsx; ' +
      '"browser" has 1 browser page open: s1',
    "held-run: ending with a failure (1 files reported, 1 still to report)",
  ]);
});

test("names each file still to report and the browser pages still open when it ends a stalled run", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const files = Array.from({ length: 12 }, (_, i) => `f${String(i).padStart(2, "0")}.test.tsx`);
  const { reporter, lines } = await startedReporter(
    fakeVitest({ openPages: { browser: ["s1", "s2"] } }),
    [spec("node", "a.test.ts"), ...files.map((file) => spec("browser", file))],
  );

  reporter.onTestModuleQueued(startedModule("browser", "f00.test.tsx"));
  t.mock.timers.tick(STALL_MS);
  await settle();

  assert.deepEqual(lines, [
    'held-run: no "browser" test finished in the last 300s while one of its files ran',
    'held-run: 1 "node" file still to report: a.test.ts',
    `held-run: 12 "browser" files still to report: ${files.join(", ")}; ` +
      '"browser" has 2 browser pages open: s1, s2',
    "held-run: ending with a failure (0 files reported, 13 still to report)",
  ]);
});

test("names only this shard's files when it ends a stalled run", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { lines } = await startedReporter(
    fakeVitest(),
    [spec("node", "a.test.ts"), spec("node", "b.test.ts"), spec("browser", "c.test.tsx")],
    { executed: [spec("node", "a.test.ts")] },
  );

  t.mock.timers.tick(STALL_MS);
  await settle();

  assert.match(lines.join("\n"), /held-run: 1 "node" file still to report: a\.test\.ts\n/);
  assert.doesNotMatch(lines.join("\n"), /b\.test\.ts|c\.test\.tsx/);
});

test("gives every other reporter the failed end of a stalled run before ending it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const calls = [];
  const order = [];
  const vitest = fakeVitest({ reporters: [endingReporter("default", calls)] });
  const { reporter } = await startedReporter(
    vitest,
    [spec("node", "a.test.ts"), spec("node", "b.test.ts")],
    { exit: (code) => order.push({ code, calls: calls.length }) },
  );

  reporter.onTestModuleQueued(startedModule("node", "a.test.ts"));
  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  reporter.onTestModuleQueued(startedModule("node", "b.test.ts"));
  t.mock.timers.tick(STALL_MS);
  await settle();

  assert.deepEqual(calls, [
    { name: "default", files: [`${ROOT}/a.test.ts`], errors: [], state: "failed" },
  ]);
  assert.deepEqual(order, [{ code: 1, calls: 1 }]);
});

test("ends a stalled run only once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = await startedReporter(fakeVitest(), [spec("node", "a.test.ts")]);

  reporter.onTestModuleQueued(startedModule("node", "a.test.ts"));
  t.mock.timers.tick(10 * STALL_MS);
  await settle();

  assert.deepEqual(exits, [1]);
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
