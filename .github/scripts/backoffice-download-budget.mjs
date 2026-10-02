import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseAst } from "vite";

const DEFAULT_DIST_DIR = "apps/backoffice/dist";
const DEFAULT_BUDGET_PATH = "apps/backoffice/download-budget.json";
const REMOTE_OR_INLINE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const MEASURES = ["entry", "total"];
const CONTENT_HASHED_NAME = /^(.+)-[A-Za-z0-9_-]{8}(\.[^.]+)$/;
const BUDGET_SHAPE = `the budget must hold exactly ${MEASURES.join(" and ")}, each a positive whole number of bytes`;

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

function isPropertyName(parent, field) {
  return (field === "property" || field === "key") && !parent.computed;
}

function nameReplacements(code) {
  const replacements = [];
  const visit = (node, parent, field) => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent, field);
      return;
    }
    if (node === null || typeof node !== "object" || typeof node.type !== "string") return;
    if (node.type === "Identifier") {
      if (!isPropertyName(parent, field)) replacements.push([node.start, node.end, "_"]);
      return;
    }
    if (node.type === "ImportSpecifier" || node.type === "ExportSpecifier") {
      replacements.push([node.start, node.end, "_ as _"]);
      return;
    }
    if (node.type === "Property" && node.shorthand) {
      replacements.push([
        node.key.start,
        node.key.end,
        `${code.slice(node.key.start, node.key.end)}:_`,
      ]);
      if (node.value.type === "AssignmentPattern") visit(node.value.right, node.value, "right");
      return;
    }
    for (const [key, value] of Object.entries(node)) visit(value, node, key);
  };
  visit(parseAst(code), { type: "Program" }, "body");
  return replacements;
}

function withNamesLeftOut(code) {
  let result = "";
  let copiedUpTo = 0;
  for (const [start, end, replacement] of nameReplacements(code)) {
    result += code.slice(copiedUpTo, start) + replacement;
    copiedUpTo = end;
  }
  return result + code.slice(copiedUpTo);
}

function withContentHashesLeftOut(text, fileNames) {
  let result = text;
  for (const fileName of fileNames) {
    const match = CONTENT_HASHED_NAME.exec(fileName);
    if (match) result = result.replaceAll(fileName, `${match[1]}${match[2]}`);
  }
  return result;
}

function asText(content) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return undefined;
  }
}

function measuredSizeOf(path, fileNames) {
  const content = readFileSync(path);
  const text = asText(content);
  if (text === undefined) return gzipSizeOf(content);
  const script = path.endsWith(".js") ? withNamesLeftOut(text) : text;
  return gzipSizeOf(withContentHashesLeftOut(script, fileNames));
}

function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

export function measureDownload(distDir) {
  const indexPath = join(distDir, "index.html");
  const referenced = localFilesReferencedBy(readFileSync(indexPath, "utf8"));
  const missing = referenced.filter((file) => !existsSync(join(distDir, file)));
  const present = referenced.filter((file) => !missing.includes(file));
  const files = filesUnder(distDir);
  const fileNames = files.map((file) => basename(file));
  const sizeOf = (path) => measuredSizeOf(path, fileNames);

  const entry = [indexPath, ...present.map((file) => join(distDir, file))]
    .map(sizeOf)
    .reduce((sum, size) => sum + size, 0);
  const total = files.map(sizeOf).reduce((sum, size) => sum + size, 0);

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
    return [BUDGET_SHAPE];
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
  if (!holdsExactlyTheMeasures(budget)) {
    logError(`backoffice-download-budget: ${BUDGET_SHAPE}`);
    return 1;
  }
  const measured = measureDownload(distDir);

  for (const measure of MEASURES) {
    log(
      `${measure}: ${measured[measure]} / ${budget[measure]} bytes gzip, with the bundler's names and content hashes left out`,
    );
  }

  const violations = findBudgetViolations(measured, budget);
  for (const violation of violations) logError(`backoffice-download-budget: ${violation}`);
  return violations.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(runCli());
}
