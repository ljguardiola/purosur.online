import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// A value or modifier glued to a utility (`w-[1px]`, `w-(--x)`, `bg-ink/[0.5]`), a bracket glued to a
// variant (`hover:[&>svg]:`), or a class that starts with `[`: an arbitrary variant (`[&>svg]:`) or
// property (`[mask-type:luminance]`). The property form needs no space after its colon, which keeps
// TypeScript index signatures such as `[key: string]` out.
const ARBITRARY_VALUE =
  /(?<=[a-z0-9])[-/](?:\[[^\]\s]*\]|\(--[^)\s]*\))|(?<=[a-z0-9]:)\[[^\]\s]*\]|(?<![^\s"'`])\[(?:&|[a-z-]+:[^\s\]])[^\]\s]*\]/gi;

const CLASS_TOKEN = /[^\s"'`]+/g;

const NUMERIC_Z_INDEX_UTILITY = /^!?-?z-\d+(?![\w.-])/i;

const SCANNED_ROOTS = ["packages/ui/src/", "apps/backoffice/src/", "apps/pos/src/renderer/"];

function positionOf(source, index, text) {
  const before = source.slice(0, index).split("\n");
  return { line: before.length, column: before.at(-1).length + 1, text };
}

function findMatches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => positionOf(source, match.index, match[0]));
}

function utilityStart(token) {
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...token].entries()) {
    if (character === "[" || character === "(") depth += 1;
    else if ((character === "]" || character === ")") && depth > 0) depth -= 1;
    else if (character === ":" && depth === 0) start = index + 1;
  }
  return start;
}

export function findArbitraryValues(source) {
  return findMatches(source, ARBITRARY_VALUE);
}

export function findNumericZIndexUtilities(source) {
  return [...source.matchAll(CLASS_TOKEN)].flatMap((match) => {
    const token = match[0];
    const start = utilityStart(token);
    const utility = NUMERIC_Z_INDEX_UTILITY.exec(token.slice(start));
    return utility ? [positionOf(source, match.index, token.slice(0, start) + utility[0])] : [];
  });
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) => {
    const source = readFile(path);
    return [...findArbitraryValues(source), ...findNumericZIndexUtilities(source)].map((match) => ({
      path,
      ...match,
    }));
  });
}

export function describeViolation({ path, line, column, text }) {
  return `${path}:${line}:${column}: ${text}`;
}

function defaultListTrackedFiles(cwd) {
  return execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter((path) => path !== "");
}

export function findScannedFiles(cwd = process.cwd(), listTrackedFiles = defaultListTrackedFiles) {
  return listTrackedFiles(cwd)
    .filter(
      (path) =>
        SCANNED_ROOTS.some((root) => path.startsWith(root)) &&
        /\.tsx?$/.test(path) &&
        !/\.test\.tsx?$/.test(path),
    )
    .sort();
}
