import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findRealTimeViolations,
  findScannedFiles,
  isTestOnlyHelperPath,
  readVerifyStaticTestGlobs,
  readVitestProjects,
} from "./no-real-time-in-tests.mjs";

// findRealTimeViolations: measures real elapsed time -----------------------------------------

test("flags a Date.now() difference compared with a fixed value", () => {
  const source = [
    "const started = Date.now();",
    "doWork();",
    "expect(Date.now() - started < 1000).toBe(true);",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.ts");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
  assert.match(violations[0].reason, /measures real elapsed time/);
});

test("flags a performance.now() elapsed comparison", () => {
  const source = [
    "const started = performance.now();",
    "assert.ok(performance.now() - started < 1000);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags a comparison using process.hrtime.bigint()", () => {
  const source = [
    "const started = process.hrtime.bigint();",
    "assert.ok(process.hrtime.bigint() - started < 1_000_000n);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags process.hrtime called with an argument", () => {
  const source = [
    "const started = process.hrtime();",
    "const diff = process.hrtime(started);",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.ts");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
});

test("flags a process.uptime() elapsed comparison", () => {
  const source = [
    "const started = process.uptime();",
    "assert.ok(process.uptime() - started < 1);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags a new Date() with no arguments compared to a clock-derived identifier", () => {
  const source = [
    "const started = new Date();",
    "assert.ok(new Date().getTime() - started.getTime() < 1000);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

for (const matcher of [
  "toBeLessThan",
  "toBeLessThanOrEqual",
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeCloseTo",
]) {
  test(`flags expect(a).${matcher}(b) when both operands are clock-derived`, () => {
    const source = [
      "const started = Date.now();",
      `expect(Date.now()).${matcher}(started + 100);`,
    ].join("\n");

    const violations = findRealTimeViolations(source, "a.test.ts");

    assert.equal(violations.length, 1);
    assert.equal(violations[0].line, 2);
  });
}

test("does not flag expect(a).toBeLessThan(b) when only one operand is clock-derived", () => {
  const source = ["expect(Date.now()).toBeLessThan(1000);"].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag new Date(Date.now() + X) on its own", () => {
  const source = ["const future = new Date(Date.now() + 1000);"].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag new Date(now.getTime() + 1000)", () => {
  const source = ["const now = new Date();", "const future = new Date(now.getTime() + 1000);"].join(
    "\n",
  );

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag createdAt: new Date() in an object literal", () => {
  const source = ["const record = { createdAt: new Date() };"].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag (x ?? Date.now()) + 1", () => {
  const source = ["const seed = (x ?? Date.now()) + 1;"].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag vi.setSystemTime(Date.now() + 120_000)", () => {
  const source = ["vi.setSystemTime(Date.now() + 120_000);"].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag building an expected string from today's date", () => {
  const source = [
    "const today = new Date();",
    "const expected = today.getFullYear() + '-' + (today.getMonth() + 1);",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag an ordinary subtraction of two unrelated numbers", () => {
  assert.deepEqual(findRealTimeViolations("const total = price - discount;", "a.test.ts"), []);
});

test("flags an elapsed comparison through a same-file function that reads the clock", () => {
  const source = [
    "function now() { return performance.now(); }",
    'test("a", () => {',
    "  const started = now();",
    "  expect(now() - started).toBeLessThan(100);",
    "});",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.ts");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 4);
});

test("flags an elapsed comparison through a const-bound arrow that reads the clock through another", () => {
  const source = [
    "const read = () => Date.now();",
    "const now = function () { return read(); };",
    "const started = now();",
    "assert.ok(now() - started < 100);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("does not flag property names that match a clock-derived name", () => {
  const source = [
    "const now = new Date();",
    'test("a", () => {',
    "  expect(a.now - b.now).toBe(0);",
    "  expect({ now: 1 }.now - c.now).toBe(0);",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("still treats a shorthand property as a reference to the clock-derived value", () => {
  const source = ["const now = Date.now();", "assert.ok(pick({ now }) - Date.now() < 5);"].join(
    "\n",
  );

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("does not flag an elapsed comparison inside a test that installs fake timers", () => {
  const source = [
    'test("a", () => {',
    "  vi.useFakeTimers();",
    "  const started = Date.now();",
    "  vi.advanceTimersByTime(5);",
    "  expect(Date.now() - started).toBe(5);",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("flags an elapsed comparison whose clock the installed fake timers leave real", () => {
  const source = [
    'test("a", () => {',
    '  vi.useFakeTimers({ toFake: ["setTimeout"] });',
    "  const started = performance.now();",
    "  expect(performance.now() - started).toBe(5);",
    "});",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("does not flag an elapsed comparison whose clock the installed fake timers list", () => {
  const source = [
    'test("a", () => {',
    '  vi.useFakeTimers({ toFake: ["performance", "hrtime"] });',
    "  const started = performance.now();",
    "  const startedHr = process.hrtime.bigint();",
    "  expect(performance.now() - started).toBe(5);",
    "  expect(process.hrtime.bigint() - startedHr).toBe(5n);",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

// findRealTimeViolations: waits a fixed real time ---------------------------------------------

test("flags a bare setTimeout wait with a fixed delay", () => {
  const source = "await new Promise((r) => setTimeout(r, 200));";

  const violations = findRealTimeViolations(source, "a.test.ts");

  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /waits a fixed real time/);
});

test("flags globalThis.setTimeout with a fixed delay", () => {
  const source = "globalThis.setTimeout(() => {}, 500);";

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags a setTimeout alias bound with .bind(...)", () => {
  const source = [
    "const realSetTimeout = globalThis.setTimeout.bind(globalThis);",
    "realSetTimeout(() => {}, 500);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags setInterval with a fixed delay", () => {
  const source = "setInterval(() => {}, 500);";

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags setTimeout imported from node:timers/promises with a fixed delay", () => {
  const source = [
    'import { setTimeout as sleep } from "node:timers/promises";',
    "await sleep(200);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags scheduler.wait imported from timers/promises with a fixed delay", () => {
  const source = [
    'import { scheduler } from "timers/promises";',
    "await scheduler.wait(200);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags setTimeout and scheduler.wait through a namespace import of node:timers/promises", () => {
  const source = [
    'import * as t from "node:timers/promises";',
    'test("a", async () => {',
    "  await t.setTimeout(200);",
    "  await t.scheduler.wait(200);",
    "});",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 2);
});

test("flags setTimeout through a default import of timers/promises", () => {
  const source = ['import timers from "timers/promises";', "await timers.setTimeout(200);"].join(
    "\n",
  );

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags a setTimeout alias destructured from globalThis", () => {
  const source = [
    "const { setTimeout: real } = globalThis;",
    'test("a", async () => {',
    "  await new Promise((r) => real(r, 200));",
    "});",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags any .waitForTimeout(...) call, always", () => {
  const source = "await page.waitForTimeout(300);";

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags a race timer that resolves rather than only rejecting", () => {
  const source = "await Promise.race([x, new Promise((r) => setTimeout(r, 50))]);";

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("does not flag setTimeout with an absent delay", () => {
  const source = "new Promise((r) => setTimeout(r));";

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag setTimeout with a literal 0 delay, a yield", () => {
  const source = "new Promise((r) => setTimeout(r, 0));";

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag setImmediate, queueMicrotask, expect.poll or vi.waitFor", () => {
  const source = [
    "setImmediate(() => {});",
    "queueMicrotask(() => {});",
    "await expect.poll(() => x).toBe(1);",
    "await vi.waitFor(() => x);",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag a setTimeout sleep inside a for loop that can return early", () => {
  const source = [
    "for (let i = 0; i < attempts; i++) {",
    "  if (await isDone()) return;",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag a setTimeout sleep inside a while loop whose condition awaits", () => {
  const source = [
    "while (!isDone()) {",
    "  await something();",
    "  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));",
    "}",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("flags a for loop sleep with no exit in its body", () => {
  const source = [
    "for (let i = 0; i < 3; i++) {",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("does not flag a deadline callback that only rejects", () => {
  const source = [
    "new Promise((resolve, reject) => {",
    "  realSetTimeout(() => reject(new Error(`timed out`)), MS);",
    "  doThing().then(resolve);",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag a deadline callback that is the reject identifier itself", () => {
  const source = [
    "new Promise((resolve, reject) => {",
    "  setTimeout(reject, MS);",
    "  doThing().then(resolve);",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag a deadline callback that only throws", () => {
  const source = [
    "new Promise((resolve, reject) => {",
    "  setTimeout(() => {",
    "    throw new Error(`timed out`);",
    "  }, MS);",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("flags a for loop sleep whose only break leaves an inner switch", () => {
  const source = [
    "for (let i = 0; i < 3; i++) {",
    "  switch (state()) {",
    "    case 1:",
    "      break;",
    "  }",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags a for loop sleep whose only break leaves an inner loop or labeled block", () => {
  const source = [
    "for (let i = 0; i < 3; i++) {",
    "  for (const x of xs) {",
    "    if (x) break;",
    "  }",
    "  inner: {",
    "    if (y) break inner;",
    "  }",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("does not flag a loop sleep that breaks out of the loop itself, directly or by label", () => {
  const source = [
    "for (let i = 0; i < 3; i++) {",
    "  if (await isDone()) break;",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
    "outer: while (true) {",
    "  for (const x of xs) {",
    "    if (await isDone(x)) break outer;",
    "  }",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag setTimeout(..., 0) even at module scope", () => {
  assert.deepEqual(findRealTimeViolations("setTimeout(resolve, 0);", "a.test.ts"), []);
});

test("does not flag a setTimeout in a test that calls a helper installing fake timers", () => {
  const source = [
    'describe("thing", () => {',
    "  function withFakeTimers() {",
    "    vi.useFakeTimers();",
    "  }",
    "  const alsoFake = () => withFakeTimers();",
    '  test("does x", () => {',
    "    const schedule = vi.fn((run, delayMs) => setTimeout(run, delayMs));",
    "    alsoFake();",
    "    scheduleSomething(() => setTimeout(tick, 500));",
    "  });",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.tsx"), []);
});

test("does not flag a setTimeout inside a helper that installs fake timers", () => {
  const source = [
    "function withTimers() {",
    "  vi.useFakeTimers();",
    "  const scheduleOnTimer = (run, delayMs) => setTimeout(run, delayMs);",
    "  return scheduleOnTimer;",
    "}",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("flags a setTimeout in a test other than the one that installed fake timers", () => {
  const source = [
    'test("a", () => {',
    "  vi.useFakeTimers();",
    "  vi.useRealTimers();",
    "});",
    'test("b", async () => {',
    "  await new Promise((r) => setTimeout(r, 500));",
    "  expect(x).toBe(1);",
    "});",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.ts");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 6);
});

test("does not flag a setTimeout under an outer describe whose beforeEach installs fake timers", () => {
  const source = [
    'describe("a", () => {',
    "  beforeEach(() => vi.useFakeTimers());",
    '  describe("b", () => {',
    '    test("x", () => {',
    "      setTimeout(fn, 500);",
    "    });",
    "  });",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("does not flag a setTimeout under a file-level beforeAll installing fake timers through a helper", () => {
  const source = [
    "function freeze() {",
    "  vi.useFakeTimers();",
    "}",
    "beforeAll(freeze);",
    'test("x", () => {',
    "  setTimeout(fn, 500);",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
});

test("flags a setTimeout in a sibling describe of the one installing fake timers", () => {
  const source = [
    'describe("a", () => {',
    "  beforeEach(() => vi.useFakeTimers());",
    "});",
    'describe("b", () => {',
    '  test("waits", () => {',
    "    setTimeout(() => {}, 500);",
    "  });",
    "});",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.tsx").length, 1);
});

test("flags a setTimeout when the installed fake timers do not fake setTimeout", () => {
  const source = [
    'test("a", () => {',
    '  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });',
    "  setTimeout(fn, 500);",
    "  setInterval(fn, 500);",
    "});",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.ts");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
});

test("flags a real setTimeout captured before freezing, even where fake timers are installed", () => {
  const source = [
    "const realSetTimeout = globalThis.setTimeout.bind(globalThis);",
    "const { setTimeout: captured } = window;",
    'test("a", () => {',
    "  vi.useFakeTimers();",
    "  realSetTimeout(fn, 500);",
    "  captured(fn, 500);",
    "  window.setTimeout(fn, 500);",
    "});",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.ts");

  assert.deepEqual(
    violations.map((violation) => violation.line),
    [5, 6],
  );
});

// checkFiles / describeViolation ---------------------------------------------------------------

test("checkFiles reports violations across several files with reason", () => {
  const files = {
    "a.test.ts": "setTimeout(() => {}, 500);\n",
    "b.test.ts": "export const clean = true;\n",
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "a.test.ts");
  assert.match(violations[0].reason, /waits a fixed real time/);
});

test("describeViolation includes the path, line, source text and reason", () => {
  const description = describeViolation({
    path: "a.test.ts",
    line: 2,
    text: "setTimeout(() => {}, 500);",
    reason: "waits a fixed real time",
  });

  assert.match(description, /a\.test\.ts:2:/);
  assert.match(description, /setTimeout/);
  assert.match(description, /waits a fixed real time/);
});

// readVitestProjects -----------------------------------------------------------------------

test("reads every project's include globs, setupFiles and globalSetup", () => {
  const config = [
    "export default defineConfig({",
    "  test: {",
    "    projects: [",
    '      { test: { name: "node", include: ["a/**/*.test.ts"], globalSetup: [r("./setup.ts")] } },',
    '      { plugins: [react()], test: { name: "browser", include: ["b/**/*.test.tsx"], setupFiles: [r("./browser-setup.ts")] } },',
    "    ],",
    "  },",
    "});",
  ].join("\n");

  const projects = readVitestProjects(config);

  assert.deepEqual(projects, [
    { include: ["a/**/*.test.ts"], setupFiles: [], globalSetup: ["./setup.ts"] },
    { include: ["b/**/*.test.tsx"], setupFiles: ["./browser-setup.ts"], globalSetup: [] },
  ]);
});

test("reads a setupFiles or globalSetup given as a single path", () => {
  const config = [
    "export default defineConfig({",
    "  test: {",
    "    projects: [",
    '      { test: { include: ["a/**/*.test.ts"], setupFiles: "./setup.ts", globalSetup: r("./global.ts") } },',
    "    ],",
    "  },",
    "});",
  ].join("\n");

  assert.deepEqual(readVitestProjects(config), [
    { include: ["a/**/*.test.ts"], setupFiles: ["./setup.ts"], globalSetup: ["./global.ts"] },
  ]);
});

test("readVitestProjects fails on a setupFiles or globalSetup it cannot read", () => {
  const configWith = (setup) =>
    [
      "export default defineConfig({",
      `  test: { projects: [{ test: { include: ["a/**/*.test.ts"], ${setup} } }] },`,
      "});",
    ].join("\n");

  assert.throws(() => readVitestProjects(configWith("setupFiles: setupPaths")));
  assert.throws(() => readVitestProjects(configWith("setupFiles: [...shared]")));
  assert.throws(() => readVitestProjects(configWith("globalSetup: [r(base)]")));
});

test("readVitestProjects fails when the config has no test.projects array", () => {
  assert.throws(() => readVitestProjects('export default { test: { name: "node" } };'));
});

// readVerifyStaticTestGlobs ------------------------------------------------------------------

test("reads the node --test glob from the verify:static script", () => {
  const packageJson = JSON.stringify({
    scripts: {
      "verify:static": "tsc --noEmit && node --test .github/scripts/*.test.mjs",
    },
  });

  assert.deepEqual(readVerifyStaticTestGlobs(packageJson), [".github/scripts/*.test.mjs"]);
});

test("reads only the node --test arguments up to the next shell operator", () => {
  const scriptWith = (script) => JSON.stringify({ scripts: { "verify:static": script } });

  assert.deepEqual(
    readVerifyStaticTestGlobs(scriptWith("node --test a/*.test.mjs b/*.test.mjs && biome ci .")),
    ["a/*.test.mjs", "b/*.test.mjs"],
  );
  assert.deepEqual(readVerifyStaticTestGlobs(scriptWith("node --test a/*.test.mjs; echo done")), [
    "a/*.test.mjs",
  ]);
  assert.deepEqual(readVerifyStaticTestGlobs(scriptWith("node --test a/*.test.mjs | tee log")), [
    "a/*.test.mjs",
  ]);
});

test("readVerifyStaticTestGlobs fails when node --test is given no glob", () => {
  const scriptWith = (script) => JSON.stringify({ scripts: { "verify:static": script } });

  assert.throws(() => readVerifyStaticTestGlobs(scriptWith("node --test && biome ci .")));
});

test("readVerifyStaticTestGlobs fails when there is no verify:static script", () => {
  assert.throws(() => readVerifyStaticTestGlobs(JSON.stringify({ scripts: {} })));
});

// isTestOnlyHelperPath -----------------------------------------------------------------------

test("treats files under a test-only directory, or with a test basename token, as test helpers", () => {
  for (const path of [
    "apps/cloud/src/test-support/build-test-app.ts",
    "packages/ui/src/test/axe.ts",
    "apps/cloud/src/db/tests/seed.ts",
    "apps/cloud/src/__tests__/helpers.ts",
    "apps/pos/src/fixtures/sale.ts",
    "packages/domain/src/fakes/clock.ts",
    "apps/cloud/src/db/build-test-database.ts",
    "apps/cloud/src/db/test.ts",
  ]) {
    assert.equal(isTestOnlyHelperPath(path), true, path);
  }
});

test("does not treat production files as test helpers", () => {
  for (const path of [
    "apps/cloud/src/db/database.ts",
    "packages/ui/src/components/Tooltip.tsx",
    "apps/cloud/src/testimonials/list.ts",
    "apps/cloud/src/latest/feed.ts",
  ]) {
    assert.equal(isTestOnlyHelperPath(path), false, path);
  }
});

// The guard itself: every scanned file in the repository. This is what fails `pnpm verify` (via
// `node --test .github/scripts/*.test.mjs`) when a test waits a fixed real time, or measures real
// elapsed time, to decide its result.
test("no scanned test file in the repository depends on real elapsed time", () => {
  const files = findScannedFiles();
  assert.ok(files.length > 0, "expected to find at least one scanned test file");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "control time with fake timers or an injected clock, or wait for the condition itself",
  );
});
