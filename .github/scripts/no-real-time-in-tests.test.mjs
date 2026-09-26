import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findRealTimeViolations,
  findScannedFiles,
  findTestOnlyHelperFiles,
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

test("flags an elapsed comparison through toBeLessThan with both sides clock-derived", () => {
  const source = [
    "const started = Date.now();",
    "doWork();",
    "const elapsed = Date.now() - started;",
    "expect(elapsed).toBeLessThan(Date.now() - started + 1);",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.ts");
  assert.ok(violations.length > 0);
});

test("flags expect(a).toBeGreaterThan(b) when both operands are clock-derived", () => {
  const source = [
    "const started = Date.now();",
    "expect(Date.now()).toBeGreaterThan(started);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

test("flags expect(a).toBeCloseTo(b) when both operands are clock-derived", () => {
  const source = [
    "const started = Date.now();",
    "expect(Date.now()).toBeCloseTo(started, 0);",
  ].join("\n");

  assert.equal(findRealTimeViolations(source, "a.test.ts").length, 1);
});

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
  assert.deepEqual(findRealTimeViolations(source_ordinary(), "a.test.ts"), []);
});
function source_ordinary() {
  return "const total = price - discount;";
}

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

test("does not flag setTimeout(..., 0) even at module scope", () => {
  assert.deepEqual(findRealTimeViolations("setTimeout(resolve, 0);", "a.test.ts"), []);
});

test("does not flag a setTimeout inside a describe block that installs fake timers anywhere in it", () => {
  const source = [
    'describe("thing", () => {',
    "  function withFakeTimers() {",
    "    vi.useFakeTimers();",
    "  }",
    '  test("does x", () => {',
    "    withFakeTimers();",
    "    scheduleSomething(() => setTimeout(tick, 500));",
    "  });",
    "});",
  ].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.tsx"), []);
});

test("flags a setTimeout outside any describe block with fake timers, in a sibling describe", () => {
  const source = [
    'describe("a", () => {',
    "  vi.useFakeTimers();",
    "});",
    'describe("b", () => {',
    '  test("waits", () => {',
    "    setTimeout(() => {}, 500);",
    "  });",
    "});",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.tsx");
  assert.equal(violations.length, 1);
});

test("does not flag a setTimeout with no enclosing describe when the file installs fake timers", () => {
  const source = ["vi.useFakeTimers();", "setTimeout(() => {}, 500);"].join("\n");

  assert.deepEqual(findRealTimeViolations(source, "a.test.ts"), []);
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

test("readVerifyStaticTestGlobs fails when there is no verify:static script", () => {
  assert.throws(() => readVerifyStaticTestGlobs(JSON.stringify({ scripts: {} })));
});

// findTestOnlyHelperFiles / findScannedFiles ------------------------------------------------

test("findTestOnlyHelperFiles finds real test-support helpers in the repository", () => {
  const files = findTestOnlyHelperFiles();

  assert.ok(files.includes("apps/cloud/src/test-support/build-test-app.ts"));
  assert.ok(files.includes("apps/cloud/src/db/build-test-database.ts"));
});

test("findScannedFiles combines project tests, the verify:static glob and helper files", () => {
  const files = findScannedFiles();

  assert.ok(files.includes(".github/scripts/no-vi-mock-in-browser-tests.test.mjs"));
  assert.ok(files.includes("apps/cloud/src/test-support/build-test-app.ts"));
  assert.ok(files.some((f) => f.endsWith(".test.tsx")));
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
