import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const SCAN_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".css"];

function isJSDocNode(node) {
  return node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;
}

function collectTokens(node, sourceFile, tokens) {
  if (isJSDocNode(node)) return;
  const children = node.getChildren(sourceFile);
  const isLeaf = children.length === 0 && node.kind !== ts.SyntaxKind.SyntaxList;
  if (isLeaf || node.kind === ts.SyntaxKind.EndOfFileToken) {
    tokens.push(node);
    return;
  }
  for (const child of children) collectTokens(child, sourceFile, tokens);
}

function commentsInTrivia(scanner, text, start, end) {
  scanner.setText(text, start, end - start);
  const comments = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      comments.push({ position: scanner.getTokenStart(), text: scanner.getTokenText() });
    }
  }
  return comments;
}

function findScriptComments(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const tokens = [];
  collectTokens(sourceFile, sourceFile, tokens);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sourceFile.languageVariant);
  return tokens
    .filter((token) => token.kind !== ts.SyntaxKind.JsxText)
    .map((token) => ({ start: token.pos, end: token.getStart(sourceFile) }))
    .filter(({ start, end }) => start < end)
    .flatMap(({ start, end }) => commentsInTrivia(scanner, sourceFile.text, start, end))
    .map(({ position, text }) => ({
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      text,
    }));
}

const CSS_COMMENT_OR_SKIPPED_TOKEN =
  /\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?|url\([^)"']*\)?/gi;

function findCssComments(source) {
  const comments = [];
  for (const match of source.matchAll(CSS_COMMENT_OR_SKIPPED_TOKEN)) {
    if (!match[0].startsWith("/*")) continue;
    comments.push({ line: source.slice(0, match.index).split("\n").length, text: match[0] });
  }
  return comments;
}

export function findComments(source, fileName = "a.ts") {
  return fileName.endsWith(".css") ? findCssComments(source) : findScriptComments(source, fileName);
}

const ISSUE_OR_PR_NUMBER = /(?<![\w&])#\d+(?!\w)/;
const GITHUB_ISSUE_OR_PULL_URL = /github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+/i;

const DOCUMENT_REFERENCE_RULES = [
  {
    reason: "cites an issue or pull request number",
    test: (text) => ISSUE_OR_PR_NUMBER.test(text),
  },
  {
    reason: "links a GitHub issue or pull request",
    test: (text) => GITHUB_ISSUE_OR_PULL_URL.test(text),
  },
  { reason: 'mentions "this issue"', test: (text) => /\bthis issue\b/i.test(text) },
  { reason: 'mentions "this PR"', test: (text) => /\bthis pr\b/i.test(text) },
  { reason: 'mentions "pull request"', test: (text) => /\bpull requests?\b/i.test(text) },
  { reason: 'uses "PR" as a standalone word', test: (text) => /\bPRs?\b/.test(text) },
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

function hasScanExtension(path) {
  return SCAN_EXTENSIONS.some((extension) => path.endsWith(extension));
}

export function findScannedFiles(cwd = process.cwd(), listTrackedFiles = defaultListTrackedFiles) {
  return listTrackedFiles(cwd).filter(hasScanExtension).sort();
}
