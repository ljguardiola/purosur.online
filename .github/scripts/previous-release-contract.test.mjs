import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  isRouteTestFile,
  listFiles,
  replaceMigrations,
  runCli,
  selectRouteTests,
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

function fakeCli({ argv, env = {}, files = [] }) {
  const calls = { swaps: [], logs: [], errors: [] };
  return {
    calls,
    deps: {
      argv,
      env: { PREVIOUS_DIR: "/previous", CURRENT_DIR: "/current", ...env },
      listFiles: (dir) => (dir === "/previous/apps/cloud/src" ? files : []),
      replaceMigrations: (arguments_) => calls.swaps.push(arguments_),
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

test("the commands fail without their inputs", async () => {
  for (const [argv, env] of [
    [[], {}],
    [["list"], { PREVIOUS_DIR: "" }],
    [["swap-migrations"], { CURRENT_DIR: "" }],
    [["unknown"], {}],
  ]) {
    const { deps, calls } = fakeCli({ argv, env });
    assert.equal(await runCli(deps), 1, argv.join(" "));
    assert.notEqual(calls.errors.length, 0);
  }
});
