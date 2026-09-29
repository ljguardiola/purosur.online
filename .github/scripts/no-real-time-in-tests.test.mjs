import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findRealTimeViolations,
  findScannedFiles,
  findTestOnlyHelperFiles,
  isTestOnlyHelperPath,
  readVerifyStaticTestGlobs,
  readVitestProjects,
} from "./no-real-time-in-tests.mjs";

function flaggedLines(source) {
  return findRealTimeViolations(source, "a.test.ts").map((violation) => violation.line);
}

test("flags a Date.now() difference compared with a fixed value, once", () => {
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

  assert.deepEqual(flaggedLines(source), [2]);
});

test("flags a comparison using process.hrtime.bigint()", () => {
  const source = [
    "const started = process.hrtime.bigint();",
    "assert.ok(process.hrtime.bigint() - started < 1_000_000n);",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [2]);
});

test("flags a new Date() with no arguments measured against a clock-derived variable", () => {
  const source = [
    "const started = new Date();",
    "assert.ok(new Date().getTime() - started.getTime() < 1000);",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [2]);
});

test("follows a clock read through assignments and other clock-derived variables", () => {
  const source = [
    "let second;",
    "let first;",
    "second = first;",
    "first = Date.now();",
    "const elapsed = Date.now() - second;",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [5]);
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

    assert.deepEqual(flaggedLines(source), [2]);
  });
}

test("flags a negated comparison matcher on clock reads", () => {
  const source = [
    "const started = Date.now();",
    "expect(Date.now()).not.toBeGreaterThan(started + 100);",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [2]);
});

test("flags a comparison whose result depends on one real clock read", () => {
  const source = [
    'test("a", () => {',
    "  expect(Date.now()).toBeLessThan(1000);",
    "  expect(record.createdAt.getTime()).toBeGreaterThan(Date.now() - 1000);",
    "  assert.ok(Date.now() < deadline);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [2, 3, 4]);
});

test("does not flag reading the clock without measuring elapsed time", () => {
  const source = [
    "const future = new Date(Date.now() + 1000);",
    "vi.setSystemTime(Date.now() + 120_000);",
    "const record = { createdAt: new Date() };",
    "const total = price - discount;",
    "const earlier = Date.now() - 1000;",
    "const readClock = () => Date.now();",
    "const gap = readClock() - Date.now();",
    "check(Date.now()).toBeLessThan(5);",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not treat a property access named like a clock-derived variable as a clock read", () => {
  const source = [
    "const now = new Date();",
    'test("a", () => {',
    "  expect(a.now - b.now).toBe(0);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag an elapsed comparison inside a test that installs fake timers", () => {
  const source = [
    'test("a", () => {',
    "  vi.useFakeTimers();",
    "  const started = Date.now();",
    "  vi.advanceTimersByTime(5);",
    "  expect(Date.now() - started).toBe(5);",
    "  expect(Date.now()).toBeGreaterThan(0);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("flags an elapsed comparison whose clock the installed fake timers leave real", () => {
  const source = [
    'test("a", () => {',
    '  vi.useFakeTimers({ toFake: ["setTimeout"] });',
    "  const started = performance.now();",
    "  expect(performance.now() - started).toBe(5);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [4]);
});

test("flags an elapsed comparison mixing a faked clock with a real one", () => {
  const source = [
    'test("a", () => {',
    '  vi.useFakeTimers({ toFake: ["Date"] });',
    "  expect(Date.now() - performance.now()).toBe(0);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [3]);
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

  assert.deepEqual(flaggedLines(source), []);
});

test("flags setTimeout and setInterval with a fixed delay", () => {
  const source = [
    "await new Promise((r) => setTimeout(r, 200));",
    "setInterval(() => {}, 500);",
  ].join("\n");

  const violations = findRealTimeViolations(source, "a.test.ts");

  assert.deepEqual(
    violations.map((violation) => violation.line),
    [1, 2],
  );
  assert.match(violations[0].reason, /waits a fixed real time/);
});

test("flags a race deadline that only rejects", () => {
  const source = [
    "await Promise.race([",
    "  work(),",
    '  new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 50)),',
    "]);",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [3]);
});

test("flags any .waitForTimeout(...) call", () => {
  assert.deepEqual(flaggedLines("await page.waitForTimeout(300);"), [1]);
});

test("does not flag a timer with an absent or literal 0 delay", () => {
  const source = ["new Promise((r) => setTimeout(r));", "setTimeout(resolve, 0);"].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag setImmediate, queueMicrotask, expect.poll or vi.waitFor", () => {
  const source = [
    "setImmediate(() => {});",
    "queueMicrotask(() => {});",
    "await expect.poll(() => x).toBe(1);",
    "await vi.waitFor(() => x);",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a sleep inside a for loop that can return early", () => {
  const source = [
    "for (let i = 0; i < attempts; i++) {",
    "  if (await isDone()) return;",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a sleep inside a while loop whose condition awaits", () => {
  const source = [
    "while (await isPending()) {",
    "  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));",
    "}",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a sleep inside a loop that can break or throw", () => {
  const source = [
    "for (let i = 0; i < 3; i++) {",
    "  if (await isDone()) break;",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
    "do {",
    '  if (attempts++ > 3) throw new Error("gave up");',
    "  await new Promise((r) => setTimeout(r, 10));",
    "} while (!done);",
    "for (const item of items) {",
    "  if (item.ready) return;",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
    "for (const key in table) {",
    "  if (table[key]) return;",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
    "do {",
    "  await new Promise((r) => setTimeout(r, 10));",
    "} while (await isPending());",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a sleep raced against a settling promise inside a polling loop", () => {
  const source = [
    "while (!settled) {",
    "  if (check()) return true;",
    "  await Promise.race([settling, new Promise((resolve) => setTimeout(resolve, 10))]);",
    "}",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("flags a sleep in a loop with no exit in its body", () => {
  const source = [
    "for (let i = 0; i < 3; i++) {",
    "  await new Promise((r) => setTimeout(r, 10));",
    "}",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [2]);
});

test("flags a timer written in a loop's condition rather than its body", () => {
  const source = [
    "while (await new Promise((r) => setTimeout(r, 10))) {",
    "  if (done()) return;",
    "}",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [1]);
});

test("flags a timer set inside a callback of a loop that can return", () => {
  const source = [
    "for (let i = 0; i < 3; i++) {",
    "  if (done()) return;",
    "  schedule(() => setTimeout(fn, 500));",
    "}",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [3]);
});

test("does not flag a timer in a test that installs fake timers", () => {
  const source = [
    'test("a", () => {',
    "  vi.useFakeTimers();",
    "  setTimeout(fn, 500);",
    "  setInterval(fn, 500);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a timer when the installed options fake everything", () => {
  const source = [
    'test("a", () => {',
    "  vi.useFakeTimers({ now: 0 });",
    "  setTimeout(fn, 500);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a timer when toFake lists it", () => {
  const source = [
    'test("a", () => {',
    '  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });',
    "  setInterval(fn, 500);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("flags a timer that toFake does not list", () => {
  const source = [
    'test("a", () => {',
    '  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });',
    "  setTimeout(fn, 500);",
    "  setInterval(fn, 500);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [3]);
});

test("does not flag a timer inside a helper that installs fake timers", () => {
  const source = [
    "function withTimers() {",
    "  vi.useFakeTimers();",
    "  const scheduleOnTimer = (run, delayMs) => setTimeout(run, delayMs);",
    "  return scheduleOnTimer;",
    "}",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a timer in a test that calls a helper installing fake timers", () => {
  const source = [
    "const withTimers = (steps) => {",
    "  vi.useFakeTimers();",
    "  steps();",
    "};",
    'test("a", () => {',
    "  const schedule = vi.fn((run, delayMs) => setTimeout(run, delayMs));",
    "  withTimers(() => schedule(fn, 500));",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a timer under an enclosing describe's beforeEach installing fake timers", () => {
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

  assert.deepEqual(flaggedLines(source), []);
});

test("does not flag a timer under a file-level beforeAll installing fake timers through a helper", () => {
  const source = [
    "function freeze() {",
    "  vi.useFakeTimers();",
    "}",
    "beforeAll(() => freeze());",
    'test("x", () => {',
    "  setTimeout(fn, 500);",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), []);
});

test("flags a timer in a test other than the one that installed fake timers", () => {
  const source = [
    'test("a", () => {',
    "  vi.useFakeTimers();",
    "});",
    'test("b", async () => {',
    "  await new Promise((r) => setTimeout(r, 500));",
    "});",
  ].join("\n");

  assert.deepEqual(flaggedLines(source), [5]);
});

test("flags a timer in a sibling describe of the one installing fake timers", () => {
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

  assert.deepEqual(flaggedLines(source), [6]);
});

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

test("readVitestProjects fails on a setupFiles or globalSetup it cannot read", () => {
  const configWith = (setup) =>
    [
      "export default defineConfig({",
      `  test: { projects: [{ test: { include: ["a/**/*.test.ts"], ${setup} } }] },`,
      "});",
    ].join("\n");

  assert.throws(
    () => readVitestProjects(configWith('setupFiles: "./setup.ts"')),
    /must list string literal paths/,
  );
  assert.throws(() => readVitestProjects(configWith("setupFiles: setupPaths")));
  assert.throws(() => readVitestProjects(configWith("setupFiles: [...shared]")));
  assert.throws(() => readVitestProjects(configWith("globalSetup: [r(base)]")));
});

test("readVitestProjects fails when the config has no test.projects array", () => {
  assert.throws(() => readVitestProjects('export default { test: { name: "node" } };'));
});

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

test("treats files under a test-support or test directory as test helpers", () => {
  for (const path of [
    "apps/cloud/src/test-support/build-test-app.ts",
    "packages/ui/src/test/axe.ts",
  ]) {
    assert.equal(isTestOnlyHelperPath(path), true, path);
  }
});

test("does not treat production files as test helpers", () => {
  for (const path of [
    "apps/cloud/src/db/database.ts",
    "packages/ui/src/components/overlays/tooltip.tsx",
    "apps/cloud/src/db/build-test-database.ts",
    "apps/cloud/src/testimonials/list.ts",
    "apps/cloud/src/latest/feed.ts",
  ]) {
    assert.equal(isTestOnlyHelperPath(path), false, path);
  }
});

test("finds test-only helpers under src, leaving out node_modules and dist", () => {
  const root = mkdtempSync(join(tmpdir(), "no-real-time-in-tests-"));
  try {
    for (const path of [
      "apps/a/src/test-support/helper.ts",
      "apps/a/src/node_modules/pkg/test/helper.ts",
      "packages/b/src/dist/test/helper.ts",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "");
    }

    assert.deepEqual(findTestOnlyHelperFiles(root), ["apps/a/src/test-support/helper.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFixtureRepository(root, paths) {
  writeFileSync(
    join(root, "vitest.config.ts"),
    [
      "export default defineConfig({",
      "  test: {",
      '    projects: [{ test: { include: ["packages/*/src/**/*.visual.tsx"] } }],',
      "  },",
      "});",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { "verify:static": "node --test .github/scripts/*.test.mjs" } }),
  );
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "");
  }
}

test("scans story files, whose play functions run as tests", () => {
  const root = mkdtempSync(join(tmpdir(), "no-real-time-in-tests-"));
  try {
    writeFixtureRepository(root, [
      "packages/ui/src/components/forms/button.stories.tsx",
      "apps/backoffice/src/catalog/products-list.stories.tsx",
    ]);

    assert.deepEqual(findScannedFiles(root), [
      "apps/backoffice/src/catalog/products-list.stories.tsx",
      "packages/ui/src/components/forms/button.stories.tsx",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skips a directory named like a scanned file", () => {
  const root = mkdtempSync(join(tmpdir(), "no-real-time-in-tests-"));
  try {
    writeFixtureRepository(root, ["packages/ui/src/catalog-screenshots.visual.tsx"]);
    mkdirSync(join(root, "packages/ui/src/__screenshots__/catalog-screenshots.visual.tsx"), {
      recursive: true,
    });
    mkdirSync(join(root, "packages/ui/src/test-support/helper.ts"), { recursive: true });

    const files = findScannedFiles(root);

    assert.deepEqual(files, ["packages/ui/src/catalog-screenshots.visual.tsx"]);
    assert.deepEqual(checkFiles(files.map((path) => join(root, path))), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no scanned test file in the repository depends on real elapsed time", () => {
  const files = findScannedFiles();
  for (const sentinel of [
    "apps/backoffice/src/catalog/test-support/products-list-screen.tsx",
    ".github/scripts/no-real-time-in-tests.test.mjs",
  ]) {
    assert.ok(files.includes(sentinel), `expected the scan to include ${sentinel}`);
  }

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "control time with fake timers or an injected clock, or wait for the condition itself",
  );
});
