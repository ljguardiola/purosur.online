import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { findPackageJSON, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOG_PREFIX = "previous-release-contract";
const CLOUD_SOURCE = "apps/cloud/src";
const CLOUD = "apps/cloud";
const MIGRATIONS = `${CLOUD}/migrations`;

// A cloud route test names the route file it exercises (`<name>-route.test.ts`, or
// `<name>-routes.test.ts` for a file holding several), optionally divided by aspect
// (`<name>-route.<aspect>.test.ts`). Integration tests need a database of their own and the node
// project leaves them out.
const ROUTE_TEST_RE = /^apps\/cloud\/src\/(?:.+\/)?[^/]*-routes?(?:\.[^/.]+)*\.test\.ts$/;

export function isRouteTestFile(path) {
  return ROUTE_TEST_RE.test(path) && !path.endsWith(".integration.test.ts");
}

export function selectRouteTests(paths) {
  return paths.filter(isRouteTestFile).sort();
}

export function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1));
}

export function replaceMigrations({ previousDir, currentDir }) {
  rmSync(join(previousDir, MIGRATIONS), { recursive: true });
  cpSync(join(currentDir, MIGRATIONS), join(previousDir, MIGRATIONS), { recursive: true });
}

function importFrom(dir, packageName, subpath) {
  const packageJson = findPackageJSON(packageName, pathToFileURL(join(dir, "package.json")));
  const { exports } = JSON.parse(readFileSync(packageJson, "utf8"));
  return import(pathToFileURL(join(dirname(packageJson), exports[subpath].import.default)).href);
}

// Vitest reports no error thrown by a global setup to its reporters, so the previous release's
// test databases are migrated here first, with its own packages, for a failure to name its cause.
export async function applyMigrations({ cloudDir, migrationsFolder }) {
  loadPgliteExtensions(extensionsCreatedBy(migrationsFolder));
  const { drizzle } = await importFrom(cloudDir, "drizzle-orm", "./pglite");
  const { migrate } = await importFrom(cloudDir, "drizzle-orm", "./pglite/migrator");
  const database = drizzle();
  try {
    await migrate(database, { migrationsFolder });
  } finally {
    await database.$client.close();
  }
}

function describeFailure(error) {
  const lines = [];
  for (let cause = error; cause !== undefined; cause = cause.cause) {
    lines.push(cause instanceof Error ? cause.message : String(cause));
  }
  return lines.join("\ncaused by: ");
}

// Vitest's --reporter replaces the reporters a config declares, and the previous release's own
// reporters may be what its sequencer needs, so the results reporter is added to them instead.
const VITEST_CONFIG = "vitest.previous-release.config.mts";

export function writeVitestConfig({ previousDir, reporter }) {
  const path = join(previousDir, VITEST_CONFIG);
  writeFileSync(
    path,
    [
      'import { mergeConfig } from "vitest/config";',
      'import previousRelease from "./vitest.config.ts";',
      "",
      `export default mergeConfig(previousRelease, { test: { reporters: [${JSON.stringify(reporter)}] } });`,
      "",
    ].join("\n"),
  );
  return path;
}

const CREATE_EXTENSION_RE = /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?"?([\w-]+)"?/gi;

export function extensionsCreatedBy(migrationsDir) {
  const names = new Set();
  for (const file of listFiles(migrationsDir).filter((path) => path.endsWith(".sql"))) {
    for (const [, name] of readFileSync(join(migrationsDir, file), "utf8").matchAll(
      CREATE_EXTENSION_RE,
    )) {
      names.add(name);
    }
  }
  return [...names].sort();
}

const PGLITE_ENTRY_RE = /\/@electric-sql\/pglite\/dist\/index\.js$/;
const WITH_EXTENSIONS = "previous-release-pglite:";

// PGlite names each contrib module after its extension with every "-" written as "_"
// (`uuid-ossp` ships as `contrib/uuid_ossp.js`).
function contribUrl(name, pgliteUrl) {
  const url = new URL(`./contrib/${name.replaceAll("-", "_")}.js`, pgliteUrl);
  if (!existsSync(fileURLToPath(url))) {
    throw new Error(
      `previous-release-pglite-extensions: PGlite ships no "${name}" extension, which the new release's migrations create`,
    );
  }
  return url.href;
}

function pgliteWithExtensions(pgliteUrl, extensions) {
  const entry = JSON.stringify(pgliteUrl);
  const imports = extensions.map(
    (name, at) => `import * as extension${at} from ${JSON.stringify(contribUrl(name, pgliteUrl))};`,
  );
  const required = extensions.map(
    (name, at) =>
      `${JSON.stringify(name)}: Object.values(extension${at}).find((value) => value?.name === ${JSON.stringify(name)})`,
  );
  return `
import * as pglite from ${entry};
${imports.join("\n")}
export * from ${entry};

const required = { ${required.join(", ")} };

function withRequired(options = {}) {
  return { ...options, extensions: { ...required, ...options.extensions } };
}

export class PGlite extends pglite.PGlite {
  constructor(dataDirOrOptions, options) {
    if (typeof dataDirOrOptions === "string") {
      super(dataDirOrOptions, withRequired(options));
    } else {
      super(withRequired(dataDirOrOptions), options);
    }
  }

  static async create(dataDirOrOptions, options) {
    const database = new PGlite(dataDirOrOptions, options);
    await database.waitReady;
    return database;
  }
}
`;
}

// PGlite loads only the extensions passed to its constructor, and the previous release's test
// databases were written before the new release's migrations created these, so every PGlite
// imported after this call gets them.
export function loadPgliteExtensions(extensions) {
  if (extensions.length === 0) {
    return;
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (PGLITE_ENTRY_RE.test(resolved.url) && !context.parentURL?.startsWith(WITH_EXTENSIONS)) {
        return { url: `${WITH_EXTENSIONS}${resolved.url}`, format: "module", shortCircuit: true };
      }
      return resolved;
    },
    load(url, context, nextLoad) {
      if (url.startsWith(WITH_EXTENSIONS)) {
        return {
          format: "module",
          source: pgliteWithExtensions(url.slice(WITH_EXTENSIONS.length), extensions),
          shortCircuit: true,
        };
      }
      return nextLoad(url, context);
    },
  });
}

// A test is named as Vitest prints it: its file, its describe blocks and its own name, joined by " > ".
const TEST_IDENTITY_SEPARATOR = " > ";

function isTestIdentity(value) {
  if (typeof value !== "string") {
    return false;
  }
  const separatorAt = value.indexOf(TEST_IDENTITY_SEPARATOR);
  return separatorAt > 0 && value.slice(separatorAt + TEST_IDENTITY_SEPARATOR.length).trim() !== "";
}

export function parseDeclaredBreaks(input) {
  if (input === undefined || input.trim() === "") {
    return { declared: [] };
  }
  let declared;
  try {
    declared = JSON.parse(input);
  } catch {
    declared = undefined;
  }
  if (!Array.isArray(declared) || !declared.every(isTestIdentity)) {
    return {
      error: `the declared breaks must be a JSON array of "<file> > <test's full name>" strings`,
    };
  }
  return { declared };
}

function stateOf(tests, id) {
  const matching = tests.filter((test) => test.id === id);
  if (matching.some((test) => test.state === "failed")) {
    return "failed";
  }
  return matching[0]?.state ?? "did not run";
}

export function judgeRun({ testsPassed, results, declared }) {
  if (!testsPassed && results === undefined) {
    return { passed: false, lines: ["undeclared failure: the run left no results"] };
  }
  const tests = results?.tests ?? [];
  const lines = declared.map((id) => `declared break ${stateOf(tests, id)}: ${id}`);
  if (testsPassed) {
    return { passed: true, lines };
  }
  const failed = tests.filter((test) => test.state === "failed").map((test) => test.id);
  const undeclared = [...failed.filter((id) => !declared.includes(id)), ...results.otherFailures];
  if (failed.length === 0 && undeclared.length === 0) {
    undeclared.push("the run failed with no failing test");
  }
  return {
    passed: undeclared.length === 0,
    lines: [...lines, ...undeclared.map((failure) => `undeclared failure: ${failure}`)],
  };
}

function readResults(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  listFiles: listFilesIn = listFiles,
  replaceMigrations: replaceMigrationsIn = replaceMigrations,
  applyMigrations: applyMigrationsIn = applyMigrations,
  writeVitestConfig: writeVitestConfigIn = writeVitestConfig,
  readResults: readResultsIn = readResults,
  log = console.log,
  logError = console.error,
} = {}) {
  const {
    PREVIOUS_DIR,
    CURRENT_DIR,
    DECLARED_BREAKS,
    RESULTS_FILE,
    RESULTS_REPORTER,
    TESTS_OUTCOME,
  } = env;
  const [command] = argv;

  if (command === "list") {
    if (!PREVIOUS_DIR) {
      logError(`${LOG_PREFIX}: PREVIOUS_DIR is required`);
      return 1;
    }
    const routeTests = selectRouteTests(
      listFilesIn(join(PREVIOUS_DIR, CLOUD_SOURCE)).map((path) => `${CLOUD_SOURCE}/${path}`),
    );
    if (routeTests.length === 0) {
      logError(`${LOG_PREFIX}: no route test found under ${CLOUD_SOURCE} of ${PREVIOUS_DIR}`);
      return 1;
    }
    log(routeTests.join("\n"));
    return 0;
  }
  if (command === "swap-migrations") {
    if (!PREVIOUS_DIR || !CURRENT_DIR) {
      logError(`${LOG_PREFIX}: PREVIOUS_DIR and CURRENT_DIR are required`);
      return 1;
    }
    replaceMigrationsIn({ previousDir: PREVIOUS_DIR, currentDir: CURRENT_DIR });
    return 0;
  }
  if (command === "migrate") {
    if (!PREVIOUS_DIR) {
      logError(`${LOG_PREFIX}: PREVIOUS_DIR is required`);
      return 1;
    }
    try {
      await applyMigrationsIn({
        cloudDir: join(PREVIOUS_DIR, CLOUD),
        migrationsFolder: join(PREVIOUS_DIR, MIGRATIONS),
      });
    } catch (error) {
      logError(
        `${LOG_PREFIX}: applying the migrations to the previous release's test databases failed, which stops the promote: ${describeFailure(error)}`,
      );
      return 1;
    }
    log("the migrations apply to the previous release's test databases");
    return 0;
  }
  if (command === "write-vitest-config") {
    if (!PREVIOUS_DIR || !RESULTS_REPORTER) {
      logError(`${LOG_PREFIX}: PREVIOUS_DIR and RESULTS_REPORTER are required`);
      return 1;
    }
    log(writeVitestConfigIn({ previousDir: PREVIOUS_DIR, reporter: RESULTS_REPORTER }));
    return 0;
  }
  if (command === "check-declared") {
    const { declared, error } = parseDeclaredBreaks(DECLARED_BREAKS);
    if (error) {
      logError(`${LOG_PREFIX}: ${error}`);
      return 1;
    }
    log(
      declared.length === 0
        ? "no declared break"
        : declared.map((id) => `declared break: ${id}`).join("\n"),
    );
    return 0;
  }
  if (command === "judge") {
    if (!RESULTS_FILE || !["success", "failure"].includes(TESTS_OUTCOME)) {
      logError(
        `${LOG_PREFIX}: RESULTS_FILE and a TESTS_OUTCOME of "success" or "failure" are required`,
      );
      return 1;
    }
    const { declared, error } = parseDeclaredBreaks(DECLARED_BREAKS);
    if (error) {
      logError(`${LOG_PREFIX}: ${error}`);
      return 1;
    }
    const verdict = judgeRun({
      testsPassed: TESTS_OUTCOME === "success",
      results: readResultsIn(RESULTS_FILE),
      declared,
    });
    if (verdict.lines.length > 0) {
      log(verdict.lines.join("\n"));
    }
    if (!verdict.passed) {
      logError(`${LOG_PREFIX}: an undeclared failure stops the promote`);
      return 1;
    }
    return 0;
  }
  logError(
    `${LOG_PREFIX}: the command must be "list", "swap-migrations", "migrate", "write-vitest-config", "check-declared" or "judge"`,
  );
  return 1;
}

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
