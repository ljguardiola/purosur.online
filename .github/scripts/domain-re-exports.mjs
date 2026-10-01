import { globSync, readFileSync } from "node:fs";
import ts from "typescript";

export const CONTRACTS_DOMAIN_VALUE_RE_EXPORT_ALLOWLIST = [
  "packages/contracts/src/access/pin-code-redemption.ts#PIN_MIN_DIGITS",
  "packages/contracts/src/register/core-messages.ts#ARGENTINA_TIME_ZONE",
  "packages/contracts/src/register/core-messages.ts#CASH_MOVEMENT_REASON_MAX_LENGTH",
  "packages/contracts/src/register/core-messages.ts#CASH_MOVEMENT_TYPES",
  "packages/contracts/src/register/core-messages.ts#cashCharge",
  "packages/contracts/src/register/core-messages.ts#cashMovementPermission",
  "packages/contracts/src/register/core-messages.ts#cashMovementReason",
  "packages/contracts/src/register/core-messages.ts#parseAmountCents",
  "packages/contracts/src/sales/sale.ts#SEARCH_RESULT_LIMIT",
];

const DOMAIN_RE_EXPORT =
  /export\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']@purosur\/domain(?:\/[^"']*)?["']/g;

const isDomainSpecifier = (node) =>
  node !== undefined && /^@purosur\/domain(?:\/|$)/.test(node.text);

function unwrapped(expression) {
  return ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
    ? unwrapped(expression.expression)
    : expression;
}

function domainValueImports(statements) {
  return new Set(
    statements
      .filter(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          isDomainSpecifier(statement.moduleSpecifier) &&
          !statement.importClause?.isTypeOnly,
      )
      .flatMap(({ importClause }) => {
        const bindings = importClause?.namedBindings;
        if (bindings === undefined || !ts.isNamedImports(bindings)) return [];
        return bindings.elements
          .filter((element) => !element.isTypeOnly)
          .map((element) => element.name.text);
      }),
  );
}

function exportedNames(statement) {
  if (ts.isVariableStatement(statement)) {
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) return [];
    return statement.declarationList.declarations
      .map((declaration) => declaration.initializer && unwrapped(declaration.initializer))
      .filter((initializer) => initializer !== undefined && ts.isIdentifier(initializer))
      .map((initializer) => ({ name: initializer.text, local: true }));
  }
  if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) return [];
  const fromDomain = isDomainSpecifier(statement.moduleSpecifier);
  if (statement.moduleSpecifier !== undefined && !fromDomain) return [];
  const clause = statement.exportClause;
  if (clause === undefined) return [{ name: "*", local: false }];
  if (ts.isNamespaceExport(clause)) return [{ name: clause.name.text, local: false }];
  return clause.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => ({ name: (element.propertyName ?? element.name).text, local: !fromDomain }));
}

export function findDomainValueReExports(source) {
  const { statements } = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest);
  const imported = domainValueImports(statements);
  const names = statements
    .flatMap(exportedNames)
    .filter(({ name, local }) => !local || imported.has(name))
    .map(({ name }) => name);
  return [...new Set(names)];
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
