import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const LOG_PREFIX = "previous-release-contract";
const CLOUD_SOURCE = "apps/cloud/src";
const MIGRATIONS = "apps/cloud/migrations";

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
  readResults: readResultsIn = readResults,
  log = console.log,
  logError = console.error,
} = {}) {
  const { PREVIOUS_DIR, CURRENT_DIR, DECLARED_BREAKS, RESULTS_FILE, TESTS_OUTCOME } = env;
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
    `${LOG_PREFIX}: the command must be "list", "swap-migrations", "check-declared" or "judge"`,
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
