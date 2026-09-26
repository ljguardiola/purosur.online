import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const SCAN_ROOTS = ["packages", "apps", ".github/scripts"];
const SCAN_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
}

const OPAQUE_KINDS = new Set([
  ts.SyntaxKind.JsxText,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

function opaqueSpans(sourceFile) {
  const spans = [];
  const visit = (node) => {
    if (OPAQUE_KINDS.has(node.kind)) spans.push([node.getStart(sourceFile), node.getEnd()]);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return spans;
}

function isInsideAnySpan(position, spans) {
  return spans.some(([start, end]) => position >= start && position < end);
}

const COMMENT_PATTERN = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

export function findComments(source, fileName = "a.ts") {
  const sourceFile = parse(source, fileName);
  const spans = opaqueSpans(sourceFile);
  const comments = [];
  for (const match of source.matchAll(COMMENT_PATTERN)) {
    if (isInsideAnySpan(match.index, spans)) continue;
    comments.push({
      line: sourceFile.getLineAndCharacterOfPosition(match.index).line + 1,
      text: match[0],
    });
  }
  return comments;
}

const ISSUE_OR_PR_NUMBER = /^#\d+$/;
const LEADING_PUNCTUATION = /^[([{"'`]+/;
const TRAILING_PUNCTUATION = /[)\]}"'`.,;:!?]+$/;

function mentionsIssueOrPrNumber(text) {
  return text.split(/\s+/).some((token) => {
    const stripped = token.replace(LEADING_PUNCTUATION, "").replace(TRAILING_PUNCTUATION, "");
    return ISSUE_OR_PR_NUMBER.test(stripped);
  });
}

const DOCUMENT_REFERENCE_RULES = [
  { reason: "cites an issue or pull request number", test: mentionsIssueOrPrNumber },
  { reason: 'mentions "this issue"', test: (text) => /\bthis issue\b/i.test(text) },
  { reason: 'mentions "this PR"', test: (text) => /\bthis pr\b/i.test(text) },
  { reason: 'mentions "pull request"', test: (text) => /\bpull request\b/i.test(text) },
  { reason: 'uses "PR" as a standalone word', test: (text) => /\bPR\b/.test(text) },
  { reason: 'mentions "design doc"', test: (text) => /\bdesign doc\b/i.test(text) },
  { reason: "names a Markdown file", test: (text) => /\b[\w-]+\.md\b/i.test(text) },
  { reason: "names a design (.pen) file", test: (text) => /\b[\w-]+\.pen\b/i.test(text) },
  { reason: "cites a section number", test: (text) => /§\s*\d+(?:\.\d+)*/.test(text) },
];

export function describeDocumentReference(commentText) {
  return DOCUMENT_REFERENCE_RULES.find((rule) => rule.test(commentText))?.reason;
}

export function findDocumentReferences(source, fileName = "a.ts") {
  return findComments(source, fileName)
    .map(({ line, text }) => ({ line, text: text.trim(), reason: describeDocumentReference(text) }))
    .filter((violation) => violation.reason !== undefined);
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findDocumentReferences(readFile(path), path).map((violation) => ({ path, ...violation })),
  );
}

export function describeViolation({ path, line, text, reason }) {
  return `${path}:${line}: ${text} (${reason})`;
}

function defaultListTrackedFiles(cwd) {
  return execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter((path) => path !== "");
}

function hasScanRoot(path) {
  return SCAN_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

function hasScanExtension(path) {
  return SCAN_EXTENSIONS.some((extension) => path.endsWith(extension));
}

export function findScannedFiles(cwd = process.cwd(), listTrackedFiles = defaultListTrackedFiles) {
  return listTrackedFiles(cwd).filter(hasScanRoot).filter(hasScanExtension).sort();
}
