import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// A value or modifier glued to a utility (`w-[1px]`, `w-(--x)`, `bg-ink/[0.5]`), a bracket glued to a
// variant (`hover:[&>svg]:`), or an arbitrary property that starts a class (`[mask-type:luminance]`).
// The property form needs no space after its colon, which keeps TypeScript index signatures such as
// `[key: string]` out.
const ARBITRARY_VALUE =
  /(?<=[a-z0-9])[-/](?:\[[^\]\s]*\]|\(--[^)\s]*\))|(?<=[a-z0-9]:)\[[^\]\s]*\]|(?<![^\s"'`])\[[a-z-]+:[^\s\]][^\]\s]*\]/gi;

const CLASS_TOKEN = /[^\s"'`]+/g;

const NUMERIC_Z_INDEX_UTILITY = /^!?-?z-\d+(?![\w.-])/i;

const SCANNED_ROOTS = ["packages/ui/src/", "apps/backoffice/src/", "apps/pos/src/renderer/"];

function positionOf(source, index, text) {
  const before = source.slice(0, index).split("\n");
  return { line: before.length, column: before.at(-1).length + 1, text };
}

function utilityStart(token) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === "[" || character === "(") depth += 1;
    else if ((character === "]" || character === ")") && depth > 0) depth -= 1;
    else if (character === ":" && depth === 0) start = index + 1;
  }
  return start;
}

const CLASS_BOUNDARY = /[\s"'`]/;

function closingBracketFrom(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) return -1;
    if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

const CSS_PSEUDO_NAMES = new Set([
  "active",
  "active-view-transition",
  "active-view-transition-type",
  "after",
  "any-link",
  "autofill",
  "backdrop",
  "before",
  "blank",
  "buffering",
  "checked",
  "checkmark",
  "column",
  "cue",
  "cue-region",
  "current",
  "default",
  "defined",
  "details-content",
  "dir",
  "disabled",
  "empty",
  "enabled",
  "file-selector-button",
  "first",
  "first-child",
  "first-letter",
  "first-line",
  "first-of-type",
  "focus",
  "focus-visible",
  "focus-within",
  "fullscreen",
  "future",
  "grammar-error",
  "has",
  "has-slotted",
  "highlight",
  "host",
  "host-context",
  "hover",
  "in-range",
  "indeterminate",
  "invalid",
  "is",
  "lang",
  "last-child",
  "last-of-type",
  "left",
  "link",
  "local-link",
  "marker",
  "modal",
  "muted",
  "not",
  "nth-child",
  "nth-col",
  "nth-last-child",
  "nth-last-col",
  "nth-last-of-type",
  "nth-of-type",
  "only-child",
  "only-of-type",
  "open",
  "optional",
  "out-of-range",
  "part",
  "past",
  "paused",
  "picker",
  "picker-icon",
  "picture-in-picture",
  "placeholder",
  "placeholder-shown",
  "playing",
  "popover-open",
  "read-only",
  "read-write",
  "required",
  "right",
  "root",
  "scope",
  "scroll-button",
  "scroll-marker",
  "scroll-marker-group",
  "seeking",
  "selection",
  "slotted",
  "spelling-error",
  "stalled",
  "state",
  "target",
  "target-current",
  "target-text",
  "target-within",
  "user-invalid",
  "user-valid",
  "valid",
  "view-transition",
  "view-transition-group",
  "view-transition-image-pair",
  "view-transition-new",
  "view-transition-old",
  "visited",
  "volume-locked",
  "where",
]);

// No Tailwind utility starts with `-webkit-` or `-moz-`, but `-ms-` also starts a negative
// margin-inline-start (`-ms-4`), so Microsoft's pseudos are named one by one.
const MICROSOFT_PSEUDO_NAMES = new Set([
  "-ms-browse",
  "-ms-check",
  "-ms-clear",
  "-ms-expand",
  "-ms-fill",
  "-ms-fill-lower",
  "-ms-fill-upper",
  "-ms-input-placeholder",
  "-ms-reveal",
  "-ms-thumb",
  "-ms-track",
  "-ms-value",
]);

function segmentsAfterColon(source, start) {
  const segments = [];
  let depth = 0;
  let segmentStart = start;
  let index = start;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (character === "[" || character === "(") depth += 1;
    else if ((character === "]" || character === ")") && depth > 0) depth -= 1;
    else if (depth === 0 && CLASS_BOUNDARY.test(character)) break;
    else if (depth === 0 && character === ":") {
      segments.push(source.slice(segmentStart, index));
      segmentStart = index + 1;
    }
  }
  segments.push(source.slice(segmentStart, index));
  return segments;
}

function isCssPseudo(segment) {
  if (segment === "") return true;
  const name = /^[a-z-]+(?![\w-])/i.exec(segment);
  if (name === null) return false;
  const lowerCaseName = name[0].toLowerCase();
  return (
    CSS_PSEUDO_NAMES.has(lowerCaseName) ||
    MICROSOFT_PSEUDO_NAMES.has(lowerCaseName) ||
    /^-(?:webkit|moz)-/.test(lowerCaseName)
  );
}

// A class that opens with a bracket closed right before a colon and a utility (`[data-slot]:p-4`). A
// computed property or an index signature is followed by a space after its colon, so it never qualifies.
// A CSS selector string such as `"[data-slot]:hover:first-child"` opens the same way, and its bracket may
// be any selector a variant's could be; it differs only in holding nothing but pseudo-classes and
// pseudo-elements after the colon, where a class ends in a utility.
function findLeadingArbitraryVariants(source) {
  return [...source.matchAll(/(?<![^\s"'`])\[/g)].flatMap(({ index: open }) => {
    const close = closingBracketFrom(source, open);
    if (close === -1 || source[close + 1] !== ":") return [];
    if (close + 2 >= source.length || CLASS_BOUNDARY.test(source[close + 2])) return [];
    if (segmentsAfterColon(source, close + 2).every(isCssPseudo)) return [];
    const bracket = source.slice(open, close + 1);
    return [{ index: open, ...positionOf(source, open, bracket) }];
  });
}

export function findArbitraryValues(source) {
  const leadingVariants = findLeadingArbitraryVariants(source);
  const leadingStarts = new Set(leadingVariants.map(({ index }) => index));
  const values = [...source.matchAll(ARBITRARY_VALUE)]
    .filter((match) => !leadingStarts.has(match.index))
    .map((match) => positionOf(source, match.index, match[0]));
  const variants = leadingVariants.map(({ index, ...position }) => position);
  return [...values, ...variants].sort((a, b) => a.line - b.line || a.column - b.column);
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
