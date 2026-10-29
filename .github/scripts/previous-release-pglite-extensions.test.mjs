import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const PRELOAD = fileURLToPath(new URL("./previous-release-pglite-extensions.mjs", import.meta.url));
const CLOUD_PACKAGE = new URL("../../apps/cloud/package.json", import.meta.url);

function pgliteEntry() {
  const packageJson = findPackageJSON("@electric-sql/pglite", CLOUD_PACKAGE);
  const { exports } = JSON.parse(readFileSync(packageJson, "utf8"));
  return pathToFileURL(join(dirname(packageJson), exports["."].import.default)).href;
}

function runWithPreload({ migrations, script }) {
  const dir = mkdtempSync(join(tmpdir(), "previous-release-pglite-extensions-"));
  try {
    const migrationsDir = join(dir, "migrations");
    const scriptPath = join(dir, "script.mjs");
    mkdirSync(migrationsDir);
    for (const [name, sql] of Object.entries(migrations)) {
      writeFileSync(join(migrationsDir, name), sql);
    }
    writeFileSync(scriptPath, script);
    return spawnSync(process.execPath, ["--import", PRELOAD, scriptPath, pgliteEntry()], {
      encoding: "utf8",
      env: { ...process.env, MIGRATIONS_DIR: migrationsDir },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("every PGlite database the previous release opens loads the extensions the new migrations create", () => {
  const run = runWithPreload({
    migrations: { "0150_search_without_accents.sql": "CREATE EXTENSION IF NOT EXISTS unaccent;" },
    script: `
      const { PGlite } = await import(process.argv[2]);
      const databases = {
        "with no options": new PGlite(),
        "with extensions of its own": new PGlite({ extensions: {} }),
        "created asynchronously": await PGlite.create(),
      };
      const answers = {};
      for (const [name, database] of Object.entries(databases)) {
        await database.exec("CREATE EXTENSION IF NOT EXISTS unaccent;");
        answers[name] = (await database.query("select unaccent('Balsámico') as text")).rows[0].text;
        await database.close();
      }
      console.log(JSON.stringify(answers));
    `,
  });

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    "with no options": "Balsamico",
    "with extensions of its own": "Balsamico",
    "created asynchronously": "Balsamico",
  });
});

test("an extension PGlite does not ship still fails the run, naming the extension", () => {
  const run = runWithPreload({
    migrations: { "0151_unknown.sql": "CREATE EXTENSION IF NOT EXISTS not_a_real_extension;" },
    script: `
      const { PGlite } = await import(process.argv[2]);
      await new PGlite().exec("CREATE EXTENSION IF NOT EXISTS not_a_real_extension;");
    `,
  });

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /not_a_real_extension/);
});
