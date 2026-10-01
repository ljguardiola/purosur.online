import { globSync, readFileSync } from "node:fs";

export const CONTRACTS_LOCAL_DOMAIN_RE_EXPORT_ALLOWLIST = [
  "packages/contracts/src/access/pin-code-redemption.ts#PIN_MIN_DIGITS",
  "packages/contracts/src/register/core-messages.ts#ARGENTINA_TIME_ZONE",
  "packages/contracts/src/register/core-messages.ts#CASH_MOVEMENT_REASON_MAX_LENGTH",
  "packages/contracts/src/register/core-messages.ts#CASH_MOVEMENT_TYPES",
  "packages/contracts/src/register/core-messages.ts#cashMovementPermission",
  "packages/contracts/src/register/core-messages.ts#cashMovementReason",
  "packages/contracts/src/register/core-messages.ts#parseAmountCents",
  "packages/contracts/src/sales/sale.ts#SEARCH_RESULT_LIMIT",
];

const DOMAIN_VALUE_IMPORT =
  /import\s+(?!type\b)\{([^}]*)\}\s*from\s*["']@purosur\/domain(?:\/[^"']*)?["']/g;
const LOCAL_EXPORT = /export\s+(?!type\b)\{([^}]*)\}(?!\s*from\b)/g;

function valueMembers(list) {
  return list
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member !== "" && !/^type\s/.test(member));
}

const importedName = (member) => member.split(/\s+as\s+/).at(-1);
const exportedLocalName = (member) => member.split(/\s+as\s+/)[0];

export function findDomainValueReExports(source) {
  const imported = new Set(
    [...source.matchAll(DOMAIN_VALUE_IMPORT)].flatMap((match) =>
      valueMembers(match[1]).map(importedName),
    ),
  );
  const exported = [...source.matchAll(LOCAL_EXPORT)].flatMap((match) =>
    valueMembers(match[1]).map(exportedLocalName),
  );
  return [...new Set(exported.filter((name) => imported.has(name)))];
}

export function findScannedFiles(cwd = process.cwd()) {
  return globSync("packages/contracts/src/**/*.ts", { cwd })
    .filter((path) => !path.endsWith(".test.ts"))
    .sort();
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findDomainValueReExports(readFile(path)).map((name) => `${path}#${name}`),
  );
}
