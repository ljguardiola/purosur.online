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

test("finds a comment before a JSDoc block that ends the file", () => {
  const comments = findComments("const a = 1;\n// closes #123\n/** x */\n");

  assert.deepEqual(comments, [
    { line: 2, text: "// closes #123" },
    { line: 3, text: "/** x */" },
  ]);
});

test("finds the JSDoc block of a file that holds only that comment", () => {
  const comments = findComments("/** see #5 */\n");

  assert.deepEqual(comments, [{ line: 1, text: "/** see #5 */" }]);
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

test("finds a comment that follows a string containing //", () => {
  const comments = findComments('fetch("https://x"); // closes #123');

  assert.deepEqual(comments, [{ line: 1, text: "// closes #123" }]);
});

test("finds the comments that follow a string containing /*", () => {
  const source = ['const g = "src/*.ts";', "// see #5", "/* end */"].join("\n");

  const comments = findComments(source);

  assert.deepEqual(comments, [
    { line: 2, text: "// see #5" },
    { line: 3, text: "/* end */" },
  ]);
});

test("finds a comment that follows a template literal containing //", () => {
  const comments = findComments("const u = `https://x/y`; // see #5");

  assert.deepEqual(
    comments.map((comment) => comment.text),
    ["// see #5"],
  );
});

test("finds a comment that follows a regex literal containing //", () => {
  const comments = findComments("const r = /\\/\\//; // see #5");

  assert.deepEqual(
    comments.map((comment) => comment.text),
    ["// see #5"],
  );
});

test("finds a JSDoc block before a declaration exactly once", () => {
  const comments = findComments("/** see #5 */\nfunction f() {}");

  assert.deepEqual(comments, [{ line: 1, text: "/** see #5 */" }]);
});

test("finds a comment inside a nested template substitution", () => {
  const comments = findComments(`const s = \`\${\`\${ /* see #5 */ x }//\`}//\`;`);

  assert.deepEqual(
    comments.map((comment) => comment.text),
    ["/* see #5 */"],
  );
});

test("finds a comment that follows a regex literal with // in a character class", () => {
  const comments = findComments("const r = /[//]/; // see #5");

  assert.deepEqual(
    comments.map((comment) => comment.text),
    ["// see #5"],
  );
});

test("finds a comment next to a division", () => {
  const source = ["const half = total / 2; // see #5", "const third = total / 3;"].join("\n");

  const comments = findComments(source);

  assert.deepEqual(comments, [{ line: 1, text: "// see #5" }]);
});

test("finds a CSS comment but not a comment-like string in a CSS file", () => {
  const source = ['a { content: "/* not a comment */"; }', "/* see #5 */"].join("\n");

  const comments = findComments(source, "a.css");

  assert.deepEqual(comments, [{ line: 2, text: "/* see #5 */" }]);
});

test("does not mistake a single-quoted CSS string containing /* for a comment", () => {
  const source = ["a { content: '/* not a comment'; }", "/* see #5 */"].join("\n");

  const comments = findComments(source, "a.css");

  assert.deepEqual(comments, [{ line: 2, text: "/* see #5 */" }]);
});

test("does not mistake an unquoted CSS url containing /* for a comment", () => {
  const source = ["a { background: url(a/*b); }", "/* see #5 */"].join("\n");

  const comments = findComments(source, "a.css");

  assert.deepEqual(comments, [{ line: 2, text: "/* see #5 */" }]);
});

test("finds an unterminated CSS comment at the end of the file", () => {
  const comments = findComments("a {}\n/* see #5", "a.css");

  assert.deepEqual(comments, [{ line: 2, text: "/* see #5" }]);
});

test("does not mistake an unterminated CSS string at the end of the file for a comment", () => {
  const comments = findComments('a { content: "/* not a comment', "a.css");

  assert.deepEqual(comments, []);
});

test("finds full-line and trailing YAML comments with their lines", () => {
  const source = ["# see #5", "key: value # closes #123", "other: 1"].join("\n");

  const comments = findComments(source, "a.yml");

  assert.deepEqual(comments, [
    { line: 1, text: "# see #5" },
    { line: 2, text: "# closes #123" },
  ]);
});

test("reads .yaml files as YAML", () => {
  const comments = findComments("# see #5\n", "pnpm-workspace.yaml");

  assert.deepEqual(comments, [{ line: 1, text: "# see #5" }]);
});

test("does not mistake a # inside a quoted YAML string for a comment", () => {
  const source = ['a: "closes #123"', "b: 'see #5' # real"].join("\n");

  const comments = findComments(source, "a.yml");

  assert.deepEqual(comments, [{ line: 2, text: "# real" }]);
});

test("does not mistake a # inside a plain YAML value, such as a URL fragment or a color, for a comment", () => {
  const source = ["url: https://example.com/page#42", "color: a#123", "- x#5"].join("\n");

  assert.deepEqual(findComments(source, "a.yml"), []);
});

test("does not mistake a # line inside a YAML block scalar for a comment", () => {
  const source = ["run: |", "  # closes #123", "  echo done", "# after"].join("\n");

  const comments = findComments(source, "a.yml");

  assert.deepEqual(comments, [{ line: 4, text: "# after" }]);
});

test("does not mistake a YAML anchor or alias for a comment", () => {
  const source = ["base: &defaults", "  a: 1", "other: *defaults"].join("\n");

  assert.deepEqual(findComments(source, "a.yml"), []);
});

test("finds a YAML comment inside a flow collection", () => {
  const source = ["list: [", "  a, # see #5", "  b", "]"].join("\n");

  const comments = findComments(source, "a.yml");

  assert.deepEqual(comments, [{ line: 2, text: "# see #5" }]);
});

test("reports an issue number in a comment that follows a URL string", () => {
  const violations = findDocumentReferences('fetch("https://x"); // closes #123');

  assert.deepEqual(violations, [
    { line: 1, text: "// closes #123", reason: "cites an issue or pull request number" },
  ]);
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

test("flags an issue number followed by a possessive", () => {
  assert.ok(describeDocumentReference("#123's fix moved here"));
});

test("flags issue numbers separated by a slash", () => {
  assert.ok(describeDocumentReference("see #12/#13"));
});

test("flags a GitHub issue URL", () => {
  assert.ok(describeDocumentReference("see https://github.com/acme/app/issues/12"));
});

test("flags a GitHub pull URL", () => {
  assert.ok(describeDocumentReference("github.com/acme/app/pull/7 moved this"));
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

test("does not flag a numeric HTML entity, such as &#39;", () => {
  assert.equal(describeDocumentReference("renders &#39; as an apostrophe"), undefined);
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

test('flags "pull requests"', () => {
  assert.ok(describeDocumentReference("two pull requests changed this"));
});

test('flags "PRs"', () => {
  assert.ok(describeDocumentReference("earlier PRs kept this shape"));
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

test("scans every tracked TS, JS and CSS file in the repository, including tests", () => {
  const tracked = [
    "packages/domain/src/index.ts",
    "packages/domain/src/index.test.ts",
    "apps/pos/electron/main.ts",
    ".github/scripts/foo.mjs",
    ".github/scripts/foo.test.mjs",
    ".claude/hooks/pretool.mjs",
    "packages-other/x.ts",
    "packages/ui/README.md",
    ".railway/railway.ts",
  ];

  const files = findScannedFiles("/repo", () => tracked);

  assert.deepEqual(files, [
    ".claude/hooks/pretool.mjs",
    ".github/scripts/foo.mjs",
    ".github/scripts/foo.test.mjs",
    ".railway/railway.ts",
    "apps/pos/electron/main.ts",
    "packages-other/x.ts",
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
    "packages/a/x.css",
    "packages/a/x.yml",
    "packages/a/x.yaml",
    "packages/a/x.json",
  ];

  const files = findScannedFiles("/repo", () => tracked);

  assert.deepEqual(files, [
    "packages/a/x.cjs",
    "packages/a/x.css",
    "packages/a/x.cts",
    "packages/a/x.js",
    "packages/a/x.jsx",
    "packages/a/x.mjs",
    "packages/a/x.mts",
    "packages/a/x.ts",
    "packages/a/x.tsx",
    "packages/a/x.yaml",
    "packages/a/x.yml",
  ]);
});

test("no scanned file in the repository has a comment citing an issue, a pull request or a document", () => {
  const files = findScannedFiles();
  for (const sentinel of [
    "apps/backoffice/src/test-support/productsListScreen.tsx",
    ".github/scripts/no-issue-pr-doc-refs-in-comments.test.mjs",
    ".railway/railway.ts",
    "packages/ui/src/styles/tokens.css",
    ".github/workflows/verify.yml",
    "pnpm-workspace.yaml",
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
