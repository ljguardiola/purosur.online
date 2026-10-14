import { cpSync, readdirSync, rmSync } from "node:fs";
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

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  listFiles: listFilesIn = listFiles,
  replaceMigrations: replaceMigrationsIn = replaceMigrations,
  log = console.log,
  logError = console.error,
} = {}) {
  const { PREVIOUS_DIR, CURRENT_DIR } = env;
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
  logError(`${LOG_PREFIX}: the command must be "list" or "swap-migrations"`);
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
