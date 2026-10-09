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
function cuitsIn(source) {
  return [...source.matchAll(CUIT_RE)].flatMap((match) => {
    const [text, prefix, body, checkDigit] = match;
    if (!TAXPAYER_TYPE_PREFIXES.has(prefix)) return [];
    return [{ index: match.index, text, digits: `${prefix}${body}${checkDigit}` }];
  });
}

const firstTenDigits = (digits) => digits.slice(0, 10);

export function fictionalCuitsIn(source) {
  return new Set(cuitsIn(source).map(({ digits }) => digits));
}

export function findCuitsOutside(source, fictional) {
  const fictionalFirstTenDigits = new Set([...fictional].map(firstTenDigits));
  return cuitsIn(source)
    .filter(({ digits }) => !fictionalFirstTenDigits.has(firstTenDigits(digits)))
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
        `${path}:${line} holds CUIT ${cuit}, which is neither one of the shared fictional ones nor one of them with another check digit`,
    ),
  );
}
