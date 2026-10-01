import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FICTIONAL_TAX_IDENTITIES_PATH =
  "packages/domain/src/fiscal/test-support/fictional-tax-identities.ts";

const CUIT_RE = /(?<!\d|\d-)(\d{2})-?(\d{8})-?(\d)(?!\d|-\d)/g;
// ARCA's taxpayer-type prefixes: people, companies and foreign taxpayers.
const TAXPAYER_TYPE_PREFIXES = new Set([
  "20",
  "23",
  "24",
  "25",
  "26",
  "27",
  "30",
  "33",
  "34",
  "50",
  "51",
  "55",
]);
const CHECK_DIGIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function hasValidCheckDigit(digits) {
  const sum = CHECK_DIGIT_WEIGHTS.reduce(
    (total, weight, index) => total + weight * Number(digits[index]),
    0,
  );
  const expected = 11 - (sum % 11);
  if (expected === 10) return false;
  return (expected === 11 ? 0 : expected) === Number(digits[10]);
}

function validCuitsIn(source) {
  return [...source.matchAll(CUIT_RE)].flatMap((match) => {
    const [text, prefix, body, checkDigit] = match;
    const digits = `${prefix}${body}${checkDigit}`;
    if (!TAXPAYER_TYPE_PREFIXES.has(prefix) || !hasValidCheckDigit(digits)) return [];
    return [{ index: match.index, text, digits }];
  });
}

export function fictionalCuitsIn(source) {
  return new Set(validCuitsIn(source).map(({ digits }) => digits));
}

export function findCuitsOutside(source, fictional) {
  return validCuitsIn(source)
    .filter(({ digits }) => !fictional.has(digits))
    .map(({ index, text }) => ({ line: source.slice(0, index).split("\n").length, cuit: text }));
}

export function findTrackedTextFiles(cwd = process.cwd()) {
  return execFileSync("git", ["ls-files", "-z"], { cwd, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "" && path !== FICTIONAL_TAX_IDENTITIES_PATH)
    .filter((path) => !readFileSync(join(cwd, path)).includes(0));
}

export function checkFiles(paths, readFile, fictional) {
  return paths.flatMap((path) =>
    findCuitsOutside(readFile(path), fictional).map(
      ({ line, cuit }) =>
        `${path}:${line} holds CUIT ${cuit}, which is not one of the shared fictional ones`,
    ),
  );
}
