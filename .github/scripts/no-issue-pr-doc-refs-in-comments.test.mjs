import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeDocumentReference,
  describeViolation,
  findComments,
  findDocumentReferences,
  findScannedFiles,
} from "./no-issue-pr-doc-refs-in-comments.mjs";

test("finds a single-line comment with its 1-indexed line", () => {
  const source = ["const a = 1;", "// a plain remark", "const b = 2;"].join("\n");

  const comments = findComments(source);

  assert.deepEqual(comments, [{ line: 2, text: "// a plain remark" }]);
});

test("finds a block comment", () => {
  const comments = findComments("const a = 1; /* a remark */");

  assert.equal(comments.length, 1);
  assert.equal(comments[0].text, "/* a remark */");
});

test("finds every comment in a file with more than one", () => {
  const source = ["// first", "const a = 1;", "// second", "const b = 2;"].join("\n");

  const comments = findComments(source);

  assert.deepEqual(
    comments.map((comment) => comment.line),
    [1, 3],
  );
});

test("finds a trailing comment at the end of the file, after the last statement", () => {
  const source = "const a = 1;\n// trailing";

  const comments = findComments(source);

  assert.deepEqual(comments, [{ line: 2, text: "// trailing" }]);
});

test("does not mistake a string literal's contents for a comment", () => {
  const comments = findComments('const s = "// closes #123";');

  assert.deepEqual(comments, []);
});

test("does not mistake a template literal's contents for a comment", () => {
  const comments = findComments("const s = `See #123 in the docs`;");

  assert.deepEqual(comments, []);
});

test("does not mistake a regex literal's contents for a comment", () => {
  const comments = findComments("const r = /#\\d+/;");

  assert.deepEqual(comments, []);
});

test("does not mistake JSX text for a comment, but still finds a real comment inside a JSX expression", () => {
  const source = [
    "function Screen() {",
    "  return (",
    "    <div>",
    "      See #123 in the app",
    "      {/* closes #123 */}",
    "    </div>",
    "  );",
    "}",
  ].join("\n");

  const comments = findComments(source, "Screen.tsx");

  assert.deepEqual(
    comments.map((comment) => comment.text),
    ["/* closes #123 */"],
  );
});

test("flags a comment citing an issue number", () => {
  assert.equal(describeDocumentReference("closes #123"), "cites an issue or pull request number");
});

test("flags a comment citing a PR number in parentheses", () => {
  assert.ok(describeDocumentReference("see (#449) for context"));
});

test("flags a comment listing more than one issue number", () => {
  assert.ok(describeDocumentReference("closes #123, #456"));
});

test("does not flag a hex color with letters, such as #1a2b3c", () => {
  assert.equal(describeDocumentReference("use #1a2b3c for the border"), undefined);
});

test("does not flag a three-letter hex color, such as #fff", () => {
  assert.equal(describeDocumentReference("#fff is the background"), undefined);
});

test("flags a digit-only value that could also be read as a CSS hex color, such as #000", () => {
  assert.ok(describeDocumentReference("#000 is black"));
});

test("does not flag a private class field name", () => {
  assert.equal(describeDocumentReference("#count tracks retries"), undefined);
});

test("does not flag a numeric URL fragment", () => {
  assert.equal(describeDocumentReference("see https://example.com/page#42 for context"), undefined);
});

test('flags "this issue"', () => {
  assert.ok(describeDocumentReference("this issue explains the workaround"));
});

test('flags "this issue" case-insensitively', () => {
  assert.ok(describeDocumentReference("This Issue needs another look"));
});

test('flags "this PR"', () => {
  assert.ok(describeDocumentReference("see this PR for background"));
});

test('flags "pull request"', () => {
  assert.ok(describeDocumentReference("opened a pull request to fix this"));
});

test('flags standalone uppercase "PR"', () => {
  assert.ok(describeDocumentReference("PR reviewers wanted a rename here"));
});

test('does not flag lowercase "pr" as a word', () => {
  assert.equal(describeDocumentReference("the pr variable holds a parsed result"), undefined);
});

test('does not flag "PR" as a substring of another word', () => {
  assert.equal(describeDocumentReference("PROBE the sensor before use"), undefined);
});

test("flags a Markdown file name", () => {
  assert.ok(describeDocumentReference("see CONTRIBUTING.md for the rule"));
});

test("flags README.md", () => {
  assert.ok(describeDocumentReference("documented in README.md"));
});

test("does not flag unrelated prose with no file name", () => {
  assert.equal(
    describeDocumentReference("measured 3.5 milliseconds, well under budget"),
    undefined,
  );
});

test("flags a design.pen reference", () => {
  assert.ok(describeDocumentReference("values come from design.pen, not this code"));
});

test('does not flag "carpenter", which merely contains "pen"', () => {
  assert.equal(describeDocumentReference("carpenter tools are not relevant here"), undefined);
});

test('flags "design doc"', () => {
  assert.ok(describeDocumentReference("see the design doc for the spacing scale"));
});

test('does not flag "well-designed document", which is not the phrase "design doc"', () => {
  assert.equal(describeDocumentReference("a well-designed document helps everyone"), undefined);
});

test("flags a section citation", () => {
  assert.ok(describeDocumentReference("per §4.4 the deadline is fixed"));
});

test('does not flag the English word "section" alone', () => {
  assert.equal(describeDocumentReference("section 4.4 covers the deadline"), undefined);
});

test("does not flag a comment stating an external fact with no issue, PR or document reference", () => {
  assert.equal(
    describeDocumentReference("react-aria filters aria-disabled from DatePicker's root"),
    undefined,
  );
});

test("findDocumentReferences reports only the violating comments in a file, trimmed", () => {
  const source = ["// a plain remark", "// closes #123", "const a = 1;"].join("\n");

  const violations = findDocumentReferences(source);

  assert.deepEqual(violations, [
    { line: 2, text: "// closes #123", reason: "cites an issue or pull request number" },
  ]);
});

test("checkFiles reports violations across several files with their path", () => {
  const files = {
    "a.ts": "// closes #123",
    "b.ts": "// nothing to see here",
  };
  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.deepEqual(violations, [
    {
      path: "a.ts",
      line: 1,
      text: "// closes #123",
      reason: "cites an issue or pull request number",
    },
  ]);
});

test("describeViolation includes the path, line, source text and reason", () => {
  const message = describeViolation({
    path: "a.ts",
    line: 1,
    text: "// closes #123",
    reason: "cites an issue or pull request number",
  });

  assert.equal(message, "a.ts:1: // closes #123 (cites an issue or pull request number)");
});

test("scans tracked TS/JS files under packages/, apps/ and .github/scripts, including tests", () => {
  const tracked = [
    "packages/domain/src/index.ts",
    "packages/domain/src/index.test.ts",
    "apps/pos/electron/main.ts",
    ".github/scripts/foo.mjs",
    ".github/scripts/foo.test.mjs",
    "packages-other/x.ts",
    "docs/readme.ts",
    "packages/ui/README.md",
    ".railway/railway.ts",
  ];

  const files = findScannedFiles("/repo", () => tracked);

  assert.deepEqual(files, [
    ".github/scripts/foo.mjs",
    ".github/scripts/foo.test.mjs",
    "apps/pos/electron/main.ts",
    "packages/domain/src/index.test.ts",
    "packages/domain/src/index.ts",
  ]);
});

test("scans every listed extension", () => {
  const tracked = [
    "packages/a/x.ts",
    "packages/a/x.tsx",
    "packages/a/x.mts",
    "packages/a/x.cts",
    "packages/a/x.js",
    "packages/a/x.jsx",
    "packages/a/x.mjs",
    "packages/a/x.cjs",
    "packages/a/x.json",
  ];

  const files = findScannedFiles("/repo", () => tracked);

  assert.deepEqual(files, [
    "packages/a/x.cjs",
    "packages/a/x.cts",
    "packages/a/x.js",
    "packages/a/x.jsx",
    "packages/a/x.mjs",
    "packages/a/x.mts",
    "packages/a/x.ts",
    "packages/a/x.tsx",
  ]);
});

test("no scanned file in the repository has a comment citing an issue, a pull request or a document", () => {
  const files = findScannedFiles();
  for (const sentinel of [
    "apps/backoffice/src/test-support/productsListScreen.tsx",
    ".github/scripts/no-issue-pr-doc-refs-in-comments.test.mjs",
  ]) {
    assert.ok(files.includes(sentinel), `expected the scan to include ${sentinel}`);
  }

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "a technical decision belongs in the pull request, not in a code comment",
  );
});
