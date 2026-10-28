import assert from "node:assert/strict";
import { test } from "node:test";
import { HeldRunReporter } from "./held-run-reporter.mjs";

const GRACE_MS = 60_000;
const STALL_MS = 300_000;
const ROOT = "/repo";

function fakeVitest({ watch = false, openPages = {}, unhandledErrors = [] } = {}) {
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
  };
}

function spec(project, file) {
  return { moduleId: `${ROOT}/${file}`, project: { name: project } };
}

function finishedModule(project, file, state = "passed") {
  return { moduleId: `${ROOT}/${file}`, project: { name: project }, state: () => state };
}

function startedReporter(vitest, specs, { finishWith = [] } = {}) {
  const lines = [];
  const exits = [];
  const reporter = new HeldRunReporter({
    graceMs: GRACE_MS,
    stallMs: STALL_MS,
    finishWith,
    log: (line) => lines.push(line),
    exit: (code) => exits.push(code),
  });
  reporter.onInit(vitest);
  reporter.onTestRunStart(specs);
  return { reporter, lines, exits };
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

test("ends a run whose files all passed with a passing result once the grace period passes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = startedReporter(fakeVitest(), [spec("node", "a.test.ts")]);

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
  const { reporter, exits } = startedReporter(fakeVitest(), [
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
  const { reporter, exits } = startedReporter(fakeVitest({ unhandledErrors: [new Error("x")] }), [
    spec("node", "a.test.ts"),
  ]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  assert.deepEqual(exits, [1]);
});

test("leaves a run that ends within the grace period to end by itself", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits, lines } = startedReporter(fakeVitest(), [spec("node", "a.test.ts")]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  reporter.onTestRunEnd();
  t.mock.timers.tick(GRACE_MS + STALL_MS);
  await settle();

  assert.deepEqual(exits, []);
  assert.deepEqual(lines, []);
});

test("never ends a run while one of its files has not reported", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, exits } = startedReporter(fakeVitest(), [
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
  const { reporter, lines } = startedReporter(
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
  const { reporter, lines } = startedReporter(fakeVitest({ openPages: { browser: [] } }), [
    spec("node", "a.test.ts"),
  ]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  assert.match(lines.join("\n"), /no browser page is open/);
});

test("lets the other reporters finish with every reported file before ending a held run", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const calls = [];
  const order = [];
  const durations = {
    onTestRunEnd: async (modules, errors, state) => {
      calls.push({ files: modules.map((m) => m.moduleId), errors, state });
      order.push("reporter");
    },
  };
  const lines = [];
  const reporter = new HeldRunReporter({
    graceMs: GRACE_MS,
    stallMs: STALL_MS,
    finishWith: [durations],
    log: (line) => lines.push(line),
    exit: () => order.push("exit"),
  });
  reporter.onInit(fakeVitest());
  reporter.onTestRunStart([spec("node", "a.test.ts")]);

  reporter.onTestModuleEnd(finishedModule("node", "a.test.ts", "failed"));
  t.mock.timers.tick(GRACE_MS);
  await settle();

  assert.deepEqual(calls, [{ files: [`${ROOT}/a.test.ts`], errors: [], state: "failed" }]);
  assert.deepEqual(order, ["reporter", "exit"]);
});

test("names a project none of whose remaining files finished within the stall period", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { reporter, lines } = startedReporter(fakeVitest({ openPages: { browser: ["s1"] } }), [
    spec("node", "a.test.ts"),
    spec("node", "b.test.ts"),
    spec("node", "c.test.ts"),
    spec("browser", "x.test.tsx"),
    spec("browser", "y.test.tsx"),
  ]);

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
  const { lines } = startedReporter(
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
  const { reporter, exits, lines } = startedReporter(fakeVitest({ watch: true }), [
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
  const { reporter, lines } = startedReporter(fakeVitest(), [spec("node", "a.test.ts")]);

  reporter.onTestRunEnd();
  t.mock.timers.tick(10 * STALL_MS);
  await settle();

  assert.deepEqual(lines, []);
});
