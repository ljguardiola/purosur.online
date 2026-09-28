import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Either `utility-[value]`, or a class that starts with `[`: an arbitrary variant (`[&>svg]:`) or
// property (`[mask-type:luminance]`). The property form needs no space after its colon, which keeps
// TypeScript index signatures such as `[key: string]` out.
const ARBITRARY_VALUE =
  /(?<=[a-z0-9])-\[[^\]\s]*\]|(?<![^\s"'`])\[(?:&|[a-z-]+:[^\s\]])[^\]\s]*\]/gi;

const SCANNED_ROOTS = ["packages/ui/src/", "apps/backoffice/src/", "apps/pos/src/renderer/"];

export function findArbitraryValues(source) {
  return [...source.matchAll(ARBITRARY_VALUE)].map((match) => {
    const before = source.slice(0, match.index).split("\n");
    return { line: before.length, column: before.at(-1).length + 1, text: match[0] };
  });
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findArbitraryValues(readFile(path)).map((match) => ({ path, ...match })),
  );
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
