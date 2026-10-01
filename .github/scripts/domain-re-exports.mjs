import { globSync, readFileSync } from "node:fs";

export const CONTRACTS_DOMAIN_VALUE_RE_EXPORT_ALLOWLIST = [
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
const LOCAL_CONSTANT_EXPORT = /export\s+(?:const|let|var)\s+[\w$]+([^;]*);/g;
const DECLARATOR_SEPARATOR = /,(?=\s*[A-Za-z_$][\w$]*\s*[:=])/;
const INITIALIZER = /(?<![=<>!])=(?![=>])([\s\S]*)/;
const BARE_IDENTIFIER = /^([A-Za-z_$][\w$]*)(?:\s+(?:as|satisfies)\s[\s\S]*)?$/;
const DOMAIN_RE_EXPORT =
  /export\s+(type\s+)?(?:\*(?:\s+as\s+([\w$]+))?|\{([^}]*)\})\s*from\s*["']@purosur\/domain(?:\/[^"']*)?["']/g;

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
  const exported = [
    ...[...source.matchAll(LOCAL_EXPORT)].flatMap((match) =>
      valueMembers(match[1]).map(exportedLocalName),
    ),
    ...[...source.matchAll(LOCAL_CONSTANT_EXPORT)].flatMap(([, declaration]) =>
      declaration.split(DECLARATOR_SEPARATOR).flatMap((declarator) => {
        const initializer = declarator.match(INITIALIZER)?.[1].trim();
        return initializer?.match(BARE_IDENTIFIER)?.[1] ?? [];
      }),
    ),
  ].filter((name) => imported.has(name));
  const reExported = [...source.matchAll(DOMAIN_RE_EXPORT)]
    .filter(([, typeOnly]) => typeOnly === undefined)
    .flatMap(([, , namespace, members]) =>
      members === undefined ? [namespace ?? "*"] : valueMembers(members).map(exportedLocalName),
    );
  return [...new Set([...exported, ...reExported])];
}

export function hasDomainReExport(source) {
  return source.match(DOMAIN_RE_EXPORT) !== null;
}

export function findScannedFiles(cwd = process.cwd()) {
  return globSync("packages/contracts/src/**/*.ts", { cwd })
    .filter((path) => !path.endsWith(".test.ts"))
    .sort();
}

export function findScreenFiles(cwd = process.cwd()) {
  return globSync(["apps/backoffice/src/**/*.{ts,tsx}", "apps/pos/src/renderer/**/*.{ts,tsx}"], {
    cwd,
  })
    .filter((path) => !/\.test\.tsx?$/.test(path))
    .sort();
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findDomainValueReExports(readFile(path)).map((name) => `${path}#${name}`),
  );
}

export function checkScreenFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.filter((path) => hasDomainReExport(readFile(path)));
}
