import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCommand } from "./guard-command.mjs";

const VALID_FEATURE_ISSUE_BODY = [
  "### Goal",
  "Let a cashier apply a discount.",
  "",
  "### Business rules",
  "Discount cannot exceed 20%.",
  "",
  "### Acceptance criteria (Given / When / Then)",
  "Given a sale, when a discount is applied, then the total updates.",
  "",
  "### Out of scope",
  "Coupon codes.",
].join("\n");

const INVALID_FEATURE_ISSUE_BODY = [
  "### Goal",
  "Let a cashier apply a discount.",
  "",
  "### Business rules",
  "Discount cannot exceed 20%.",
].join("\n");

function prBody({
  issueRef = "Closes #12",
  how = "Added a discount field to the sale form.",
  decisions = "None.",
  tested = "Added a unit test for the discount calculation.",
  impact = "- [x] None\n- [ ] Postgres migration\n- [ ] SQLite migration\n- [ ] New event `schema_version`\n- [ ] Hardware adapter change",
} = {}) {
  return [
    "## Issue",
    issueRef,
    "",
    "## How",
    how,
    "",
    "## Technical decisions",
    decisions,
    "",
    "## How it was tested",
    tested,
    "",
    "## Delivery impact",
    impact,
  ].join("\n");
}

function readerFor(files) {
  return (path) => (path in files ? files[path] : null);
}

function ctx({ branch = "feature/x", files = {} } = {}) {
  return { branch, readFile: readerFor(files) };
}

// --- git commit on main ---------------------------------------------------

test("denies git commit on main", () => {
  const problems = checkCommand('git commit -m "wip"', ctx({ branch: "main" }));
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

test("denies git commit on main with single-quoted message", () => {
  const problems = checkCommand("git commit -m 'wip'", ctx({ branch: "main" }));
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

test("allows git commit on a feature branch", () => {
  const problems = checkCommand('git commit -m "wip"', ctx({ branch: "feature/x" }));
  assert.deepEqual(problems, []);
});

test("denies git commit with an env-var prefix on main", () => {
  const problems = checkCommand('GIT_AUTHOR_NAME=bot git commit -m "wip"', ctx({ branch: "main" }));
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

test("does not deny git commit when the current branch is unknown", () => {
  const problems = checkCommand('git commit -m "wip"', ctx({ branch: null }));
  assert.deepEqual(problems, []);
});

// --- --no-verify -----------------------------------------------------------

test("denies git commit --no-verify on a feature branch", () => {
  const problems = checkCommand('git commit --no-verify -m "wip"', ctx({ branch: "feature/x" }));
  assert.ok(problems.some((p) => p.includes("--no-verify")));
});

test("denies git push --no-verify", () => {
  const problems = checkCommand(
    "git push --no-verify origin feature/x",
    ctx({ branch: "feature/x" }),
  );
  assert.ok(problems.some((p) => p.includes("--no-verify")));
});

// --- git push targeting main -------------------------------------------

test("denies git push origin main", () => {
  const problems = checkCommand("git push origin main", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

test("denies git push with a HEAD:main refspec", () => {
  const problems = checkCommand("git push origin HEAD:main", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

test("denies a bare git push while on main", () => {
  const problems = checkCommand("git push", ctx({ branch: "main" }));
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

test("allows a bare git push while on a feature branch", () => {
  const problems = checkCommand("git push", ctx({ branch: "feature/x" }));
  assert.deepEqual(problems, []);
});

test("allows git push origin feature-branch", () => {
  const problems = checkCommand("git push origin feature/x", ctx());
  assert.deepEqual(problems, []);
});

test("allows a clean git push with quoted arguments", () => {
  const problems = checkCommand("git push 'origin' \"feature/x\"", ctx());
  assert.deepEqual(problems, []);
});

// --- git push --force / -f / --force-with-lease -----------------------

test("denies git push --force", () => {
  const problems = checkCommand("git push --force origin feature/x", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("force")));
});

test("denies git push -f", () => {
  const problems = checkCommand("git push -f origin feature/x", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("force")));
});

test("denies git push --force-with-lease", () => {
  const problems = checkCommand("git push --force-with-lease origin feature/x", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("force")));
});

test("denies git push --force-with-lease=origin/feature-x with an inline value", () => {
  const problems = checkCommand(
    "git push --force-with-lease=origin/feature-x origin feature/x",
    ctx(),
  );
  assert.ok(problems.some((p) => p.toLowerCase().includes("force")));
});

test("denies --force placed after the refspec (flag-order variation)", () => {
  const problems = checkCommand("git push origin feature/x --force", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("force")));
});

test("reports both force and main problems when both apply", () => {
  const problems = checkCommand("git push --force origin main", ctx({ branch: "main" }));
  assert.ok(problems.some((p) => p.toLowerCase().includes("force")));
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

// --- git tag -------------------------------------------------------------

test("denies creating a cloud-v tag locally", () => {
  const problems = checkCommand("git tag cloud-v1.2.3", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("release")));
});

test("denies creating a pos-v tag locally", () => {
  const problems = checkCommand("git tag pos-v2.0.0", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("release")));
});

test("denies an annotated release tag regardless of flag order", () => {
  const problems = checkCommand('git tag -m "release" -a pos-v3.0.0', ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("release")));
});

test("allows listing tags", () => {
  const problems = checkCommand("git tag -l", ctx());
  assert.deepEqual(problems, []);
});

test("allows deleting a release-looking tag", () => {
  const problems = checkCommand("git tag -d cloud-v1.0.0", ctx());
  assert.deepEqual(problems, []);
});

test("allows creating a tag that does not match the release pattern", () => {
  const problems = checkCommand("git tag my-internal-checkpoint", ctx());
  assert.deepEqual(problems, []);
});

// --- gh pr create / edit --------------------------------------------------

test("denies gh pr create with no body flag at all", () => {
  const problems = checkCommand('gh pr create --title "feat: x"', ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("template")));
});

test("denies gh pr edit with no body flag at all", () => {
  const problems = checkCommand("gh pr edit 42", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("template")));
});

test("allows gh pr create --web unconditionally", () => {
  const problems = checkCommand("gh pr create --web", ctx());
  assert.deepEqual(problems, []);
});

test("allows a well-formed gh pr create via --body-file", () => {
  const problems = checkCommand(
    'gh pr create --title "feat: add discounts" --body-file /tmp/body.md',
    ctx({ files: { "/tmp/body.md": prBody() } }),
  );
  assert.deepEqual(problems, []);
});

test("allows a well-formed gh pr create via short flags -t/-b", () => {
  const problems = checkCommand(
    `gh pr create -t "feat: add discounts" -b "${prBody().replace(/"/g, '\\"')}"`,
    ctx(),
  );
  assert.deepEqual(problems, []);
});

test("allows gh pr create --body-file= with an inline path", () => {
  const problems = checkCommand(
    'gh pr create --title "feat: add discounts" --body-file=/tmp/body.md',
    ctx({ files: { "/tmp/body.md": prBody() } }),
  );
  assert.deepEqual(problems, []);
});

test("denies gh pr create when the body-file cannot be read", () => {
  const problems = checkCommand(
    'gh pr create --title "feat: x" --body-file /tmp/missing.md',
    ctx(),
  );
  assert.ok(problems.some((p) => p.toLowerCase().includes("read")));
});

test("denies gh pr create with a non-Conventional-Commit title and notes CI does the rest", () => {
  const problems = checkCommand(
    'gh pr create --title "add discounts" --body-file /tmp/body.md',
    ctx({ files: { "/tmp/body.md": prBody() } }),
  );
  assert.ok(problems.some((p) => p.toLowerCase().includes("conventional commit")));
  assert.ok(problems.some((p) => p.toLowerCase().includes("ci")));
});

test("denies gh pr create with a body missing sections", () => {
  const problems = checkCommand(
    'gh pr create --title "feat: x" --body-file /tmp/body.md',
    ctx({ files: { "/tmp/body.md": "## Issue\nCloses #12" } }),
  );
  assert.ok(problems.some((p) => p.includes("How")));
});

test("allows gh pr edit with a well-formed --body-file and no --title", () => {
  const problems = checkCommand(
    "gh pr edit 42 --body-file /tmp/body.md",
    ctx({ files: { "/tmp/body.md": prBody() } }),
  );
  assert.deepEqual(problems, []);
});

// --- gh issue create / edit -----------------------------------------------

test("denies gh issue create with no body flag at all", () => {
  const problems = checkCommand('gh issue create --title "x"', ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("template")));
});

test("denies gh issue edit with no body flag at all", () => {
  const problems = checkCommand("gh issue edit 5", ctx());
  assert.ok(problems.some((p) => p.toLowerCase().includes("template")));
});

test("allows gh issue create --web unconditionally", () => {
  const problems = checkCommand("gh issue create --web", ctx());
  assert.deepEqual(problems, []);
});

test("allows a well-formed gh issue create with an explicit type label", () => {
  const problems = checkCommand(
    'gh issue create --title "x" --label "type: feature" --body-file /tmp/body.md',
    ctx({ files: { "/tmp/body.md": VALID_FEATURE_ISSUE_BODY } }),
  );
  assert.deepEqual(problems, []);
});

test("denies a gh issue create with an explicit type label and an incomplete body", () => {
  const problems = checkCommand(
    'gh issue create --title "x" --label "type: feature" --body-file /tmp/body.md',
    ctx({ files: { "/tmp/body.md": INVALID_FEATURE_ISSUE_BODY } }),
  );
  assert.ok(problems.some((p) => p.includes("Acceptance criteria")));
  assert.ok(problems.some((p) => p.toLowerCase().includes("issue-format")));
});

test("allows gh issue create with a body-only check when no type label is known (cannot be decided locally)", () => {
  const problems = checkCommand(
    'gh issue create --title "x" --body-file /tmp/body.md',
    ctx({ files: { "/tmp/body.md": "garbage, no sections at all" } }),
  );
  assert.deepEqual(problems, []);
});

test("denies gh issue edit with --add-label type and an incomplete body", () => {
  const problems = checkCommand(
    'gh issue edit 5 --add-label "type: feature" --body-file /tmp/body.md',
    ctx({ files: { "/tmp/body.md": INVALID_FEATURE_ISSUE_BODY } }),
  );
  assert.ok(
    problems.some((p) => p.includes("Business rules") || p.includes("Acceptance criteria")),
  );
});

test("allows gh issue edit with no label change and any body (cannot be decided locally)", () => {
  const problems = checkCommand('gh issue edit 5 --body "some update"', ctx());
  assert.deepEqual(problems, []);
});

// --- chaining ---------------------------------------------------------

test("catches a denied command chained after another with &&", () => {
  const problems = checkCommand('pnpm test && git commit -m "wip"', ctx({ branch: "main" }));
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

test("catches a denied command chained with ;", () => {
  const problems = checkCommand('git add -A; git commit -m "wip"', ctx({ branch: "main" }));
  assert.ok(problems.some((p) => p.toLowerCase().includes("main")));
});

test("reports problems from every offending segment in a chain", () => {
  const problems = checkCommand(
    'git commit -m "wip" && git push origin main',
    ctx({ branch: "main" }),
  );
  assert.ok(problems.some((p) => p.toLowerCase().includes("commit")));
  assert.ok(
    problems.some((p) => p.toLowerCase().includes("push") || p.toLowerCase().includes("main")),
  );
  assert.ok(problems.length >= 2);
});

test("allows an unrelated chained command", () => {
  const problems = checkCommand("pnpm install && pnpm test", ctx({ branch: "main" }));
  assert.deepEqual(problems, []);
});

// --- unrelated / fail-open behavior -------------------------------------

test("allows unrelated commands", () => {
  assert.deepEqual(checkCommand("ls -la", ctx()), []);
  assert.deepEqual(checkCommand("pnpm verify", ctx()), []);
  assert.deepEqual(checkCommand("echo hello", ctx()), []);
});

test("never throws and fails open on an empty or missing command", () => {
  assert.doesNotThrow(() => checkCommand("", ctx()));
  assert.doesNotThrow(() => checkCommand(undefined, ctx()));
  assert.deepEqual(checkCommand("", ctx()), []);
  assert.deepEqual(checkCommand(undefined, ctx()), []);
});

test("never throws on a malformed/unterminated quote", () => {
  assert.doesNotThrow(() => checkCommand('git commit -m "wip', ctx({ branch: "main" })));
});

test("works with no context object at all", () => {
  assert.doesNotThrow(() => checkCommand('git commit -m "wip"'));
});
