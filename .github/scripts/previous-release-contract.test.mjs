import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyMigrations,
  extensionsCreatedBy,
  isRouteTestFile,
  judgeRun,
  listFiles,
  parseDeclaredBreaks,
  replaceMigrations,
  runCli,
  selectRouteTests,
  writeVitestConfig,
} from "./previous-release-contract.mjs";

test("selects the cloud's route test files, whatever aspect they are divided by", () => {
  for (const path of [
    "apps/cloud/src/alerts/alert-close-route.test.ts",
    "apps/cloud/src/sync/changes-route.first-cash-session.test.ts",
    "apps/cloud/src/payments/refund-routes.test.ts",
    "apps/cloud/src/payments/mercado-pago-notification-routes.point.test.ts",
  ]) {
    assert.equal(isRouteTestFile(path), true, path);
  }
});

test("leaves out everything that is not a route test of the cloud", () => {
  for (const path of [
    "apps/cloud/src/sessions/route-access.test.ts",
    "apps/cloud/src/alerts/alert-close-route.ts",
    "apps/cloud/src/app.test.ts",
    "apps/cloud/src/catalog/products-route.integration.test.ts",
    "apps/cloud/src/catalog/test-support/catalog-route-fixtures.ts",
    "apps/backoffice/src/catalog/products-route.test.ts",
    "packages/domain/src/catalog/products-route.test.ts",
    "apps/cloud/src/catalog/products-route.test.tsx",
  ]) {
    assert.equal(isRouteTestFile(path), false, path);
  }
});

test("selects in a stable order", () => {
  assert.deepEqual(
    selectRouteTests([
      "apps/cloud/src/b/z-route.test.ts",
      "apps/cloud/src/app.test.ts",
      "apps/cloud/src/a/y-route.test.ts",
    ]),
    ["apps/cloud/src/a/y-route.test.ts", "apps/cloud/src/b/z-route.test.ts"],
  );
});

function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "previous-release-contract-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeTree(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

test("lists the files under a folder relative to it", () => {
  withTempDir((dir) => {
    writeTree(dir, { "a/b/one.ts": "1", "two.ts": "2" });

    assert.deepEqual(listFiles(dir).sort(), ["a/b/one.ts", "two.ts"]);
  });
});

test("replaces the previous release's migrations with exactly the new release's", () => {
  withTempDir((dir) => {
    const previous = join(dir, "previous");
    const current = join(dir, "current");
    writeTree(previous, {
      "apps/cloud/migrations/0001_old.sql": "old",
      "apps/cloud/migrations/0002_only_old.sql": "only old",
      "apps/cloud/migrations/meta/_journal.json": "old journal",
    });
    writeTree(current, {
      "apps/cloud/migrations/0001_old.sql": "old",
      "apps/cloud/migrations/0003_new.sql": "new",
      "apps/cloud/migrations/meta/_journal.json": "new journal",
    });

    replaceMigrations({ previousDir: previous, currentDir: current });

    assert.deepEqual(listFiles(join(previous, "apps/cloud/migrations")).sort(), [
      "0001_old.sql",
      "0003_new.sql",
      "meta/_journal.json",
    ]);
    assert.equal(
      readFileSync(join(previous, "apps/cloud/migrations/meta/_journal.json"), "utf8"),
      "new journal",
    );
  });
});

test("names every Postgres extension the migrations create, once each", () => {
  withTempDir((dir) => {
    writeTree(dir, {
      "0001_tables.sql": 'CREATE TABLE "products" ("id" uuid PRIMARY KEY);',
      "0002_search.sql": "CREATE EXTENSION IF NOT EXISTS unaccent;",
      "0003_ids.sql":
        'create extension "uuid-ossp";\n--> statement-breakpoint\nCREATE EXTENSION pg_trgm;',
      "0004_again.sql": "CREATE EXTENSION IF NOT EXISTS unaccent;",
      "meta/_journal.json": '{"note": "CREATE EXTENSION not_a_migration"}',
    });

    assert.deepEqual(extensionsCreatedBy(dir), ["pg_trgm", "unaccent", "uuid-ossp"]);
  });
});

test("names no extension when no migration creates one", () => {
  withTempDir((dir) => {
    writeTree(dir, { "0001_tables.sql": 'CREATE TABLE "products" ("id" uuid PRIMARY KEY);' });

    assert.deepEqual(extensionsCreatedBy(dir), []);
  });
});

test("writes a Vitest config that keeps the previous release's own config and adds the results reporter", () => {
  withTempDir((dir) => {
    const path = writeVitestConfig({ previousDir: dir, reporter: "/current/results-reporter.mjs" });

    assert.equal(path, join(dir, "vitest.previous-release.config.mts"));
    assert.equal(
      readFileSync(path, "utf8"),
      [
        'import { mergeConfig } from "vitest/config";',
        'import previousRelease from "./vitest.config.ts";',
        "",
        'export default mergeConfig(previousRelease, { test: { reporters: ["/current/results-reporter.mjs"] } });',
        "",
      ].join("\n"),
    );
  });
});

const CLOUD_DIR = fileURLToPath(new URL("../../apps/cloud", import.meta.url));

function writeMigrationsFolder(dir, migrations) {
  const entries = Object.keys(migrations).map((tag, idx) => ({
    idx,
    version: "7",
    when: 1_700_000_000_000 + idx,
    tag,
    breakpoints: true,
  }));
  writeTree(dir, {
    "meta/_journal.json": JSON.stringify({ version: "7", dialect: "postgresql", entries }),
    ...Object.fromEntries(Object.entries(migrations).map(([tag, sql]) => [`${tag}.sql`, sql])),
  });
}

test("applies the migrations to a fresh database with the release's own PGlite and Drizzle", async () => {
  const dir = mkdtempSync(join(tmpdir(), "previous-release-contract-"));
  try {
    writeMigrationsFolder(dir, {
      "0000_products": 'CREATE TABLE "products" ("id" integer PRIMARY KEY);',
      "0001_names": 'ALTER TABLE "products" ADD COLUMN "name" text;',
    });

    await applyMigrations({ cloudDir: CLOUD_DIR, migrationsFolder: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a migration that fails rejects with the error Postgres gave as its cause", async () => {
  const dir = mkdtempSync(join(tmpdir(), "previous-release-contract-"));
  try {
    writeMigrationsFolder(dir, {
      "0000_products": 'CREATE TABLE "products" ("id" integer PRIMARY KEY);',
      "0001_missing": 'ALTER TABLE "suppliers" ADD COLUMN "name" text;',
    });

    await assert.rejects(
      applyMigrations({ cloudDir: CLOUD_DIR, migrationsFolder: dir }),
      (error) => {
        assert.match(error.message, /ALTER TABLE "suppliers"/);
        assert.match(error.cause?.message ?? "", /relation "suppliers" does not exist/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the migrate command gives the database the extensions the migrations create", () => {
  const dir = mkdtempSync(join(tmpdir(), "previous-release-contract-"));
  try {
    mkdirSync(join(dir, "apps/cloud"), { recursive: true });
    symlinkSync(join(CLOUD_DIR, "node_modules"), join(dir, "apps/cloud/node_modules"), "dir");
    writeMigrationsFolder(join(dir, "apps/cloud/migrations"), {
      "0000_search":
        "CREATE EXTENSION IF NOT EXISTS unaccent;\n--> statement-breakpoint\nSELECT unaccent('Balsámico');",
    });

    const run = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./previous-release-contract.mjs", import.meta.url)), "migrate"],
      { encoding: "utf8", env: { ...process.env, PREVIOUS_DIR: dir } },
    );

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /the migrations apply/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const SECOND_CREDIT_NOTE =
  "apps/cloud/src/fiscal/credit-note-route.test.ts > POST /fiscal/credit-notes > what it answers > refuses a second credit note for an invoice that already has one, issuing nothing";
const ALERT_ONCE =
  "apps/cloud/src/fiscal/credit-note-route.test.ts > POST /fiscal/credit-notes > what it answers > opens, once, an alert about the invoice that already had a credit note, naming the voided sale";
const ORPHAN_SWEEP =
  "apps/cloud/src/fiscal/restored-register-orphan-sweep-route.test.ts > POST /devices/current/orphan-sweep > what the sweep answers > requests the credit note of one of two authorized requests of one sale, keeping the other as its receipt";
const UNRELATED = "apps/cloud/src/alerts/alert-close-route.test.ts > closes an open alert";

test("reads no declared break from an empty input", () => {
  for (const input of [undefined, "", "  \n"]) {
    assert.deepEqual(parseDeclaredBreaks(input), { declared: [] }, String(input));
  }
});

test("reads the declared breaks from a JSON array of test identities", () => {
  assert.deepEqual(
    parseDeclaredBreaks(JSON.stringify([SECOND_CREDIT_NOTE, ALERT_ONCE, ORPHAN_SWEEP])),
    { declared: [SECOND_CREDIT_NOTE, ALERT_ONCE, ORPHAN_SWEEP] },
  );
});

test("refuses declared breaks that are not a JSON array of test identities", () => {
  for (const input of [
    SECOND_CREDIT_NOTE,
    "{}",
    '"apps/cloud/src/a-route.test.ts > a test"',
    "[1]",
    '[""]',
    '["a test with no file"]',
    '["apps/cloud/src/a-route.test.ts > "]',
  ]) {
    assert.match(parseDeclaredBreaks(input).error ?? "", /declared/, input);
  }
});

function results({ tests = [], otherFailures = [] } = {}) {
  return { tests, otherFailures };
}

test("with nothing declared, a run whose tests all pass passes", () => {
  const verdict = judgeRun({
    testsPassed: true,
    results: results({ tests: [{ id: UNRELATED, state: "passed" }] }),
    declared: [],
  });

  assert.equal(verdict.passed, true);
});

test("with nothing declared, any failing test stops the promote", () => {
  const verdict = judgeRun({
    testsPassed: false,
    results: results({ tests: [{ id: UNRELATED, state: "failed" }] }),
    declared: [],
  });

  assert.equal(verdict.passed, false);
  assert.match(verdict.lines.join("\n"), new RegExp(`undeclared failure: ${UNRELATED}`));
});

test("with nothing declared, a failed run stops the promote even without a failing test", () => {
  const verdict = judgeRun({ testsPassed: false, results: results(), declared: [] });

  assert.equal(verdict.passed, false);
});

test("passes when the failing tests are exactly the declared ones, listing each", () => {
  const verdict = judgeRun({
    testsPassed: false,
    results: results({
      tests: [
        { id: SECOND_CREDIT_NOTE, state: "failed" },
        { id: ALERT_ONCE, state: "failed" },
        { id: ORPHAN_SWEEP, state: "failed" },
        { id: UNRELATED, state: "passed" },
      ],
    }),
    declared: [SECOND_CREDIT_NOTE, ALERT_ONCE, ORPHAN_SWEEP],
  });

  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.lines, [
    `declared break failed: ${SECOND_CREDIT_NOTE}`,
    `declared break failed: ${ALERT_ONCE}`,
    `declared break failed: ${ORPHAN_SWEEP}`,
  ]);
});

test("passes when the failing tests are a subset of the declared ones, reporting the one that passed", () => {
  const verdict = judgeRun({
    testsPassed: false,
    results: results({
      tests: [
        { id: SECOND_CREDIT_NOTE, state: "failed" },
        { id: ALERT_ONCE, state: "passed" },
      ],
    }),
    declared: [SECOND_CREDIT_NOTE, ALERT_ONCE],
  });

  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.lines, [
    `declared break failed: ${SECOND_CREDIT_NOTE}`,
    `declared break passed: ${ALERT_ONCE}`,
  ]);
});

test("reports a declared break as failed when any of the tests it names failed", () => {
  const verdict = judgeRun({
    testsPassed: false,
    results: results({
      tests: [
        { id: SECOND_CREDIT_NOTE, state: "passed" },
        { id: SECOND_CREDIT_NOTE, state: "failed" },
      ],
    }),
    declared: [SECOND_CREDIT_NOTE],
  });

  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.lines, [`declared break failed: ${SECOND_CREDIT_NOTE}`]);
});

test("a declared test that passes in a passing run is reported, not a failure", () => {
  const verdict = judgeRun({
    testsPassed: true,
    results: results({ tests: [{ id: SECOND_CREDIT_NOTE, state: "passed" }] }),
    declared: [SECOND_CREDIT_NOTE],
  });

  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.lines, [`declared break passed: ${SECOND_CREDIT_NOTE}`]);
});

test("reports a declared test that was skipped or did not run", () => {
  const verdict = judgeRun({
    testsPassed: true,
    results: results({ tests: [{ id: ALERT_ONCE, state: "skipped" }] }),
    declared: [ALERT_ONCE, ORPHAN_SWEEP],
  });

  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.lines, [
    `declared break skipped: ${ALERT_ONCE}`,
    `declared break did not run: ${ORPHAN_SWEEP}`,
  ]);
});

test("an undeclared failing test still stops the promote beside declared ones", () => {
  const verdict = judgeRun({
    testsPassed: false,
    results: results({
      tests: [
        { id: SECOND_CREDIT_NOTE, state: "failed" },
        { id: UNRELATED, state: "failed" },
      ],
    }),
    declared: [SECOND_CREDIT_NOTE],
  });

  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.lines, [
    `declared break failed: ${SECOND_CREDIT_NOTE}`,
    `undeclared failure: ${UNRELATED}`,
  ]);
});

test("a failure outside any test stops the promote even when every failing test is declared", () => {
  const verdict = judgeRun({
    testsPassed: false,
    results: results({
      tests: [{ id: SECOND_CREDIT_NOTE, state: "failed" }],
      otherFailures: ["unhandled error: boom"],
    }),
    declared: [SECOND_CREDIT_NOTE],
  });

  assert.equal(verdict.passed, false);
  assert.match(verdict.lines.join("\n"), /undeclared failure: unhandled error: boom/);
});

test("a failed run without any failing test stops the promote even with declared breaks", () => {
  const verdict = judgeRun({
    testsPassed: false,
    results: results({ tests: [{ id: SECOND_CREDIT_NOTE, state: "passed" }] }),
    declared: [SECOND_CREDIT_NOTE],
  });

  assert.equal(verdict.passed, false);
});

test("a failed run without results stops the promote even with declared breaks", () => {
  const verdict = judgeRun({
    testsPassed: false,
    results: undefined,
    declared: [SECOND_CREDIT_NOTE],
  });

  assert.equal(verdict.passed, false);
  assert.match(verdict.lines.join("\n"), /no results/);
});

function fakeCli({ argv, env = {}, files = [], runResults, migrationError }) {
  const calls = { swaps: [], migrations: [], configs: [], logs: [], errors: [], resultsRead: [] };
  return {
    calls,
    deps: {
      argv,
      env: { PREVIOUS_DIR: "/previous", CURRENT_DIR: "/current", ...env },
      listFiles: (dir) => (dir === "/previous/apps/cloud/src" ? files : []),
      readResults: (path) => {
        calls.resultsRead.push(path);
        return runResults;
      },
      replaceMigrations: (arguments_) => calls.swaps.push(arguments_),
      applyMigrations: async (arguments_) => {
        calls.migrations.push(arguments_);
        if (migrationError) {
          throw migrationError;
        }
      },
      writeVitestConfig: (arguments_) => {
        calls.configs.push(arguments_);
        return `${arguments_.previousDir}/vitest.previous-release.config.mts`;
      },
      log: (message) => calls.logs.push(message),
      logError: (message) => calls.errors.push(message),
    },
  };
}

test("the list command prints the previous release's route tests, one path per line", async () => {
  const { deps, calls } = fakeCli({
    argv: ["list"],
    files: ["alerts/alert-close-route.test.ts", "app.test.ts", "sync/changes-route.test.ts"],
  });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.logs, [
    "apps/cloud/src/alerts/alert-close-route.test.ts\napps/cloud/src/sync/changes-route.test.ts",
  ]);
});

test("the list command fails when the previous release has no route test", async () => {
  const { deps, calls } = fakeCli({ argv: ["list"], files: ["app.test.ts"] });

  assert.equal(await runCli(deps), 1);
  assert.match(calls.errors.join("\n"), /no route test/);
});

test("the swap-migrations command gives the previous release the new migrations", async () => {
  const { deps, calls } = fakeCli({ argv: ["swap-migrations"] });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.swaps, [{ previousDir: "/previous", currentDir: "/current" }]);
});

test("the migrate command applies the previous release's migrations with its own cloud's packages", async () => {
  const { deps, calls } = fakeCli({ argv: ["migrate"] });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.migrations, [
    { cloudDir: "/previous/apps/cloud", migrationsFolder: "/previous/apps/cloud/migrations" },
  ]);
  assert.deepEqual(calls.errors, []);
});

test("the migrate command stops the promote on a failed migration, naming the error and its cause", async () => {
  const { deps, calls } = fakeCli({
    argv: ["migrate"],
    migrationError: new Error('Failed query: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', {
      cause: new Error('extension "uuid-ossp" is not available'),
    }),
  });

  assert.equal(await runCli(deps), 1);
  const errors = calls.errors.join("\n");
  assert.match(errors, /stops the promote/);
  assert.match(errors, /Failed query: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/);
  assert.match(errors, /extension "uuid-ossp" is not available/);
});

test("the write-vitest-config command prints the config it wrote for the previous release", async () => {
  const { deps, calls } = fakeCli({
    argv: ["write-vitest-config"],
    env: { RESULTS_REPORTER: "/current/results-reporter.mjs" },
  });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.configs, [
    { previousDir: "/previous", reporter: "/current/results-reporter.mjs" },
  ]);
  assert.deepEqual(calls.logs, ["/previous/vitest.previous-release.config.mts"]);
});

test("the check-declared command prints each declared break", async () => {
  const { deps, calls } = fakeCli({
    argv: ["check-declared"],
    env: { DECLARED_BREAKS: JSON.stringify([SECOND_CREDIT_NOTE]) },
  });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.logs, [`declared break: ${SECOND_CREDIT_NOTE}`]);
});

test("the check-declared command reports that nothing is declared", async () => {
  const { deps, calls } = fakeCli({ argv: ["check-declared"] });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.logs, ["no declared break"]);
});

test("the check-declared command refuses a malformed declaration", async () => {
  const { deps, calls } = fakeCli({
    argv: ["check-declared"],
    env: { DECLARED_BREAKS: SECOND_CREDIT_NOTE },
  });

  assert.equal(await runCli(deps), 1);
  assert.match(calls.errors.join("\n"), /declared/);
});

test("the judge command passes a run whose only failures are declared, logging each", async () => {
  const { deps, calls } = fakeCli({
    argv: ["judge"],
    env: {
      DECLARED_BREAKS: JSON.stringify([SECOND_CREDIT_NOTE]),
      RESULTS_FILE: "/results.json",
      TESTS_OUTCOME: "failure",
    },
    runResults: results({ tests: [{ id: SECOND_CREDIT_NOTE, state: "failed" }] }),
  });

  assert.equal(await runCli(deps), 0);
  assert.deepEqual(calls.resultsRead, ["/results.json"]);
  assert.deepEqual(calls.logs, [`declared break failed: ${SECOND_CREDIT_NOTE}`]);
});

test("the judge command fails a run with an undeclared failure", async () => {
  const { deps, calls } = fakeCli({
    argv: ["judge"],
    env: { RESULTS_FILE: "/results.json", TESTS_OUTCOME: "failure" },
    runResults: results({ tests: [{ id: UNRELATED, state: "failed" }] }),
  });

  assert.equal(await runCli(deps), 1);
  assert.match(calls.errors.join("\n"), /undeclared failure/);
});

test("the judge command passes a successful run", async () => {
  const { deps } = fakeCli({
    argv: ["judge"],
    env: { RESULTS_FILE: "/results.json", TESTS_OUTCOME: "success" },
    runResults: results({ tests: [{ id: UNRELATED, state: "passed" }] }),
  });

  assert.equal(await runCli(deps), 0);
});

test("the commands fail without their inputs", async () => {
  for (const [argv, env] of [
    [[], {}],
    [["list"], { PREVIOUS_DIR: "" }],
    [["swap-migrations"], { CURRENT_DIR: "" }],
    [["migrate"], { PREVIOUS_DIR: "" }],
    [["write-vitest-config"], {}],
    [["write-vitest-config"], { PREVIOUS_DIR: "", RESULTS_REPORTER: "/reporter.mjs" }],
    [["judge"], { TESTS_OUTCOME: "failure" }],
    [["judge"], { RESULTS_FILE: "/results.json" }],
    [["judge"], { RESULTS_FILE: "/results.json", TESTS_OUTCOME: "failure", DECLARED_BREAKS: "[" }],
    [["unknown"], {}],
  ]) {
    const { deps, calls } = fakeCli({ argv, env });
    assert.equal(await runCli(deps), 1, argv.join(" "));
    assert.notEqual(calls.errors.length, 0);
  }
});
