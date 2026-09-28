import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DEFAULT_DIST_DIR = "apps/backoffice/dist";
const DEFAULT_BUDGET_PATH = "apps/backoffice/download-budget.json";
const REMOTE_OR_INLINE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const MEASURES = ["entry", "total"];

export function gzipSizeOf(content) {
  return gzipSync(content).length;
}

export function localFilesReferencedBy(html) {
  const files = new Set();
  for (const [, address] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (REMOTE_OR_INLINE.test(address)) continue;
    files.add(address.replace(/[?#].*$/, "").replace(/^\//, ""));
  }
  return [...files];
}

function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

const gzipSizeOfFile = (path) => gzipSizeOf(readFileSync(path));

export function measureDownload(distDir) {
  const indexPath = join(distDir, "index.html");
  const referenced = localFilesReferencedBy(readFileSync(indexPath, "utf8"));
  const missing = referenced.filter((file) => !existsSync(join(distDir, file)));
  const present = referenced.filter((file) => !missing.includes(file));

  const entry = [indexPath, ...present.map((file) => join(distDir, file))]
    .map(gzipSizeOfFile)
    .reduce((sum, size) => sum + size, 0);
  const total = filesUnder(distDir)
    .map(gzipSizeOfFile)
    .reduce((sum, size) => sum + size, 0);

  return { entry, total, missing };
}

function holdsExactlyTheMeasures(budget) {
  if (typeof budget !== "object" || budget === null || Array.isArray(budget)) return false;
  return (
    Object.keys(budget).length === MEASURES.length &&
    MEASURES.every(
      (measure) =>
        Object.hasOwn(budget, measure) && Number.isInteger(budget[measure]) && budget[measure] > 0,
    )
  );
}

export function findBudgetViolations(measured, budget) {
  if (!holdsExactlyTheMeasures(budget)) {
    return [
      `the budget must hold exactly ${MEASURES.join(" and ")}, each a positive whole number of bytes`,
    ];
  }
  const violations = measured.missing.map(
    (file) => `index.html references ${file}, which the build did not produce`,
  );
  for (const measure of MEASURES) {
    if (measured[measure] > budget[measure]) {
      violations.push(
        `${measure} is ${measured[measure]} bytes gzip, over its budget of ${budget[measure]}`,
      );
    }
  }
  return violations;
}

export function runCli({
  distDir = DEFAULT_DIST_DIR,
  budgetPath = DEFAULT_BUDGET_PATH,
  log = console.log,
  logError = console.error,
} = {}) {
  if (!existsSync(join(distDir, "index.html"))) {
    logError(
      `backoffice-download-budget: ${join(distDir, "index.html")} does not exist; build the backoffice first`,
    );
    return 1;
  }

  const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
  const measured = measureDownload(distDir);

  for (const measure of MEASURES) {
    log(`${measure}: ${measured[measure]} / ${budget[measure]} bytes gzip`);
  }

  const violations = findBudgetViolations(measured, budget);
  for (const violation of violations) logError(`backoffice-download-budget: ${violation}`);
  return violations.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(runCli());
}
