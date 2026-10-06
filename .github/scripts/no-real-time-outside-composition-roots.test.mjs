import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findCompositionRoots,
  findRealTimeReads,
  findScannedFiles,
  isScannedPath,
  readCloudRoots,
  readRegisterCoreRoot,
} from "./no-real-time-outside-composition-roots.mjs";

function flaggedLines(source) {
  return findRealTimeReads(source, "a.ts").map((violation) => violation.line);
}

const readsOnLineOne = [
  "const a = new Date();",
  "const a = Date();",
  "const a = Date.now();",
  "const a = options.now ?? Date.now;",
  "const a = performance.now();",
  "const a = performance.timeOrigin;",
  "const a = process.hrtime();",
  "const a = process.hrtime.bigint();",
  "const a = process.uptime();",
  "const a = Temporal.Now.instant();",
  "const a = Temporal.Now.plainDateISO();",
  "const a = globalThis.Date.now();",
  "const a = global.Date.now();",
  "const a = new globalThis.Date();",
  "const a = globalThis.performance.now();",
  "const a = sql`select now()`;",
  `const a = sql\`select \${id}, NOW ()\`;`,
  'const a = "select current_timestamp";',
  "const a = `where created_at < CURRENT_DATE`;",
  'const a = "select current_time";',
  'const a = "select localtimestamp";',
  'const a = "select localtime";',
  'const a = "select clock_timestamp()";',
  'const a = "select statement_timestamp()";',
  'const a = "select transaction_timestamp()";',
  'const a = "select timeofday()";',
  "const a = \"select datetime('now')\";",
  "const a = \"select strftime('%s', 'NOW')\";",
  'const a = "select datetime()";',
  'const a = "select date()";',
  'const a = "select time ( )";',
  'const a = "select julianday()";',
  'const a = "select unixepoch()";',
  "const a = \"select strftime('%s')\";",
  'export { hrtime } from "node:process";',
  'export { hrtime, uptime } from "process";',
  'export * from "node:process";',
  'export * as proc from "node:process";',
  'export { performance } from "node:perf_hooks";',
  'export { default as hooks } from "node:perf_hooks";',
  "const { hrtime } = process;",
  "const { now } = Date;",
  "const { now } = performance;",
  "const { now: read } = Date;",
  "const { hrtime: { bigint } } = process;",
  "const { now } = globalThis.performance;",
  "const { performance: perf } = globalThis;",
];

const importedReads = [
  'import { hrtime } from "node:process";\nconst a = hrtime();',
  'import { hrtime } from "process";\nconst a = hrtime.bigint();',
  'import { uptime } from "node:process";\nconst a = uptime();',
  'import { hrtime as clock } from "node:process";\nconst a = clock.bigint();',
  'import * as proc from "node:process";\nconst a = proc.uptime();',
  'import proc from "node:process";\nconst a = proc.hrtime();',
  'import { performance as perf } from "node:perf_hooks";\nconst a = perf.now();',
  'import { performance } from "perf_hooks";\nconst a = performance.timeOrigin;',
  'import * as hooks from "node:perf_hooks";\nconst a = hooks.performance.now();',
  'import hooks from "node:perf_hooks";\nconst a = hooks.performance.now();',
  'import { performance as perf } from "node:perf_hooks";\nconst read = perf.now;',
  'import { uptime } from "node:process";\nconst read = uptime;',
  'import { uptime } from "node:process";\nconst clock = { read: uptime };',
  'import { uptime } from "node:process";\nfunction run(read = uptime) {}',
  'import { hrtime } from "node:process";\nexport { hrtime };',
  'import { performance as perf } from "node:perf_hooks";\nexport { perf as performance };',
  'import proc from "node:process";\nexport { proc };',
  'import * as proc from "node:process";\nconst { uptime } = proc;',
  'import proc from "node:process";\nconst { hrtime: read } = proc;',
  'import * as hooks from "node:perf_hooks";\nconst { now } = hooks.performance;',
];

for (const source of importedReads) {
  test(`flags a real-time read through an import: ${source.replace("\n", " ")}`, () => {
    assert.deepEqual(flaggedLines(source), [2]);
  });
}

for (const line of readsOnLineOne) {
  test(`flags a real-time read: ${line}`, () => {
    assert.deepEqual(flaggedLines(line), [1]);
  });
}

test("reports a read once, with its line, source text and reason", () => {
  const source = ["const clock = { now: () => 0 };", "const at = process.hrtime.bigint();"].join(
    "\n",
  );

  const violations = findRealTimeReads(source, "a.ts");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
  assert.equal(violations[0].text, "const at = process.hrtime.bigint();");
  assert.match(violations[0].reason, /real clock/);
});

test("reports the line a multi-line SQL template reads the database's clock on", () => {
  const source = ["const query = sql`", "  select id", "  where expires_at < now()", "`;"].join(
    "\n",
  );

  const violations = findRealTimeReads(source, "a.ts");

  assert.deepEqual(
    violations.map((violation) => violation.line),
    [3],
  );
  assert.match(violations[0].reason, /database's clock/);
});

const notReads = [
  "const a = new Date(value);",
  "const a = new Date(0);",
  "const a = Date.parse(text);",
  "const a = Date.UTC(2026, 0, 1);",
  "const a = date.getTime();",
  "const a = date.toISOString();",
  "function run(now: () => Date) { return now(); }",
  "const a = { now: () => at };",
  "const a = clock.now();",
  "const a = options.now ?? fallback;",
  "const a = setTimeout(done, 10);",
  'const a = "nowhere";',
  'const a = "know() how";',
  'const a = "now";',
  'const a = "current_date_of_birth";',
  'const a = "select localtimestamps";',
  "const a = sql`select id from products`;",
  "const a = timestamp('created_at').defaultNow();",
  "const a = Temporal.Instant.from(text);",
  "const a = process.env.NODE_ENV;",
  "const a = dateNow();",
  'const a = "select datetime(created_at)";',
  'const a = "select date(?)";',
  "const a = \"select strftime('%s', recorded_at)\";",
  'const a = "update(), validate(), runtime()";',
  'import { env } from "node:process";\nconst a = env.NODE_ENV;',
  'import { hrtime } from "./clock";\nconst a = hrtime();',
  'import { now } from "node:perf_hooks";\nconst a = now;',
  'export { env } from "node:process";',
  'export { hrtime } from "./clock";',
  'export * from "./clock";',
  'import { env } from "node:process";\nexport { env };',
  "const { env } = process;",
  "const { now } = clock;",
  "const { parse } = Date;",
];

for (const line of notReads) {
  test(`does not flag: ${line}`, () => {
    assert.deepEqual(flaggedLines(line), []);
  });
}

test("reads cloud composition roots from the entry points the package scripts run", () => {
  const packageJson = JSON.stringify({
    scripts: {
      build: "tsc -p tsconfig.build.json",
      start: "node dist/server.js",
      migrate: "node dist/migrate.js",
      "load-sample-data": "node --env-file=.env dist/load-sample-data.js && echo done",
      test: "vitest run",
    },
  });

  assert.deepEqual(readCloudRoots(packageJson), [
    "apps/cloud/src/load-sample-data.ts",
    "apps/cloud/src/migrate.ts",
    "apps/cloud/src/server.ts",
  ]);
});

test("reads the register core's composition root from the main build's core input", () => {
  const config = `
    export default defineConfig({
      main: {
        build: {
          rollupOptions: {
            input: {
              index: r("src/main/index.ts"),
              core: r("src/core/index.ts"),
            },
          },
        },
      },
    });
  `;

  assert.equal(readRegisterCoreRoot(config), "apps/pos/src/core/index.ts");
});

test("fails when the register's electron-vite config has no core input", () => {
  const config = `export default defineConfig({ main: { build: { rollupOptions: { input: { index: r("src/main/index.ts") } } } } });`;

  assert.throws(() => readRegisterCoreRoot(config), /core/);
});

test("fails when the register's core input is not a path", () => {
  const config = `export default defineConfig({ main: { build: { rollupOptions: { input: { core: entry } } } } });`;

  assert.throws(() => readRegisterCoreRoot(config), /core/);
});

test("fails when the cloud's package scripts run no entry point", () => {
  assert.throws(() => readCloudRoots(JSON.stringify({ scripts: { test: "vitest run" } })), /entry/);
});

test("scans production source the cloud and the register core run only", () => {
  for (const path of [
    "apps/cloud/src/access/sessions.ts",
    "apps/cloud/src/platform/clock.ts",
    "apps/pos/src/core/sync/access-page-writes.ts",
    "packages/domain/src/access/use-cases/start-account-recovery.ts",
    "packages/domain/src/pricing/model/price.ts",
    "apps/pos/src/shared/channel.ts",
  ]) {
    assert.equal(isScannedPath(path), true, path);
  }
  for (const path of [
    "apps/cloud/src/access/sessions.test.ts",
    "apps/cloud/src/access/sessions.integration.test.ts",
    "apps/cloud/src/test-support/database.ts",
    "apps/cloud/src/access/test-support/fakes.ts",
    "apps/cloud/src/access/test/fakes.ts",
    "apps/cloud/src/types.d.ts",
    "apps/pos/src/core/sync/access-page-writes.test.ts",
    "apps/pos/src/core/test-support/core.ts",
    "apps/pos/src/renderer/clock.ts",
    "apps/pos/src/main/index.ts",
    "apps/backoffice/src/shell/app.ts",
    "packages/domain/src/pricing/model/price.test.ts",
    "packages/domain/src/fiscal/test-support/fictional-tax-identities.ts",
    "packages/domain/src/access/use-cases/test-support/fakes.ts",
    "apps/pos/src/shared/channel.test.ts",
    "apps/pos/src/shared/test-support/fake-channel.ts",
    "packages/contracts/src/shared/clock.ts",
  ]) {
    assert.equal(isScannedPath(path), false, path);
  }
});

function writeTree(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

const sampleRepository = {
  "apps/cloud/package.json": JSON.stringify({ scripts: { start: "node dist/server.js" } }),
  "apps/pos/electron.vite.config.ts": `export default { main: { build: { rollupOptions: { input: { core: r("src/core/index.ts") } } } } };`,
  "apps/cloud/src/server.ts": "export const startedAt = new Date();",
  "apps/cloud/src/access/sessions.ts": "export const expired = (at: Date) => at < new Date();",
  "apps/cloud/src/access/sessions.test.ts": "const at = new Date();",
  "apps/cloud/src/test-support/database.ts": "const at = Date.now();",
  "apps/pos/src/core/index.ts": "export const clock = () => new Date();",
  "apps/pos/src/core/sync/access-page-writes.ts": "export const stamp = sql`select now()`;",
  "apps/pos/src/renderer/clock.ts": "const at = Date.now();",
  "packages/domain/src/access/model/expiry.ts":
    "export const expired = (at: Date) => at < new Date();",
  "packages/domain/src/access/model/expiry.test.ts": "const at = new Date();",
  "apps/pos/src/shared/stamp.ts": "export const stamp = () => Date.now();",
};

test("derives the composition roots and exempts them from the scan", () => {
  const root = mkdtempSync(join(tmpdir(), "no-real-time-roots-"));
  try {
    writeTree(root, sampleRepository);

    assert.deepEqual(findCompositionRoots(root), [
      "apps/cloud/src/server.ts",
      "apps/pos/src/core/index.ts",
    ]);
    assert.deepEqual(findScannedFiles(root), [
      "apps/cloud/src/access/sessions.ts",
      "apps/pos/src/core/sync/access-page-writes.ts",
      "apps/pos/src/shared/stamp.ts",
      "packages/domain/src/access/model/expiry.ts",
    ]);

    const violations = checkFiles(findScannedFiles(root).map((path) => join(root, path))).map(
      describeViolation,
    );
    assert.equal(violations.length, 4);
    assert.match(violations[0], /sessions\.ts:1: .*new Date\(\)/);
    assert.match(violations[1], /access-page-writes\.ts:1: .*now\(\)/);
    assert.match(violations[2], /stamp\.ts:1: .*Date\.now/);
    assert.match(violations[3], /expiry\.ts:1: .*new Date\(\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails loudly when a derived composition root does not exist", () => {
  const root = mkdtempSync(join(tmpdir(), "no-real-time-roots-"));
  try {
    const { "apps/cloud/src/server.ts": _server, ...withoutServer } = sampleRepository;
    writeTree(root, withoutServer);

    assert.throws(() => findCompositionRoots(root), /server\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no production source outside the composition roots reads real time", () => {
  const roots = findCompositionRoots();
  for (const sentinel of ["apps/cloud/src/server.ts", "apps/pos/src/core/index.ts"]) {
    assert.ok(roots.includes(sentinel), `expected the roots to include ${sentinel}`);
  }
  const files = findScannedFiles();
  for (const sentinel of [
    "apps/cloud/src/app.ts",
    "apps/pos/src/core/sync/access-page-writes.ts",
    "packages/domain/src/access/use-cases/index.ts",
    "apps/pos/src/shared/channel.ts",
  ]) {
    assert.ok(files.includes(sentinel), `expected the scan to include ${sentinel}`);
  }
  for (const root of roots) {
    assert.ok(!files.includes(root), `expected the scan to skip ${root}`);
  }

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "read the time from the clock handed down from the composition root",
  );
});
