import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseClosesReferences,
  parseConventionalCommitType,
  parseDeliveryImpactChecks,
  validatePr,
  validatePrBodyLocal,
} from "./validate-pr.mjs";

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

const openFeatureIssue = { number: 12, state: "open", labels: ["type: feature"] };

test("parseClosesReferences finds a single Closes reference", () => {
  assert.deepEqual(parseClosesReferences("Closes #12"), [12]);
});

test("parseClosesReferences accepts Fixes and Resolves, case-insensitively", () => {
  assert.deepEqual(parseClosesReferences("fixes #3"), [3]);
  assert.deepEqual(parseClosesReferences("RESOLVES #4"), [4]);
});

test("parseClosesReferences finds multiple references", () => {
  assert.deepEqual(parseClosesReferences("Closes #1 and closes #2"), [1, 2]);
});

test("parseClosesReferences returns an empty array when there is no reference", () => {
  assert.deepEqual(parseClosesReferences("No reference here."), []);
});

test("parseConventionalCommitType reads the type, with scope and bang", () => {
  assert.equal(parseConventionalCommitType("feat: add discounts"), "feat");
  assert.equal(parseConventionalCommitType("fix(pos): correct rounding"), "fix");
  assert.equal(parseConventionalCommitType("feat!: breaking change"), "feat");
  assert.equal(parseConventionalCommitType("feat(pos)!: breaking change"), "feat");
});

test("parseConventionalCommitType returns null for a non-conventional title", () => {
  assert.equal(parseConventionalCommitType("Add discounts"), null);
  assert.equal(parseConventionalCommitType(""), null);
});

test("parseDeliveryImpactChecks reads only checked boxes", () => {
  const checked = parseDeliveryImpactChecks(
    "- [x] Postgres migration\n- [ ] SQLite migration\n- [X] None",
  );
  assert.deepEqual([...checked].sort(), ["None", "Postgres migration"].sort());
});

test("validatePr accepts a well-formed feature PR", () => {
  const problems = validatePr({
    title: "feat: add discounts",
    body: prBody(),
    issue: openFeatureIssue,
  });
  assert.deepEqual(problems, []);
});

test("validatePr rejects a non-Conventional-Commit title", () => {
  const problems = validatePr({ title: "Add discounts", body: prBody(), issue: openFeatureIssue });
  assert.ok(problems.some((p) => p.toLowerCase().includes("conventional commit")));
});

test("validatePr requires the title type to match the issue type", () => {
  const problems = validatePr({
    title: "fix: add discounts",
    body: prBody(),
    issue: openFeatureIssue,
  });
  assert.ok(problems.some((p) => p.includes("does not match issue type")));
});

test("validatePr accepts every technical commit type for a technical issue", () => {
  const issue = { number: 12, state: "open", labels: ["type: technical"] };
  for (const type of ["chore", "refactor", "ci", "build", "test", "perf"]) {
    const problems = validatePr({ title: `${type}: upgrade pnpm`, body: prBody(), issue });
    assert.deepEqual(problems, [], `expected ${type} to be accepted`);
  }
});

test("validatePr rejects a PR referencing a spike issue", () => {
  const issue = { number: 12, state: "open", labels: ["type: spike"] };
  const problems = validatePr({ title: "feat: add discounts", body: prBody(), issue });
  assert.ok(problems.some((p) => p.toLowerCase().includes("spike")));
});

test("validatePr requires exactly one Closes reference", () => {
  const none = validatePr({ title: "feat: x", body: prBody({ issueRef: "" }), issue: null });
  assert.ok(none.some((p) => p.toLowerCase().includes("exactly one")));

  const many = validatePr({
    title: "feat: x",
    body: prBody({ issueRef: "Closes #12 and closes #13" }),
    issue: openFeatureIssue,
  });
  assert.ok(
    many.some((p) => p.toLowerCase().includes("exactly one") || p.includes("references 2")),
  );
});

test("validatePr reports when the referenced issue does not exist", () => {
  const problems = validatePr({ title: "feat: x", body: prBody(), issue: null });
  assert.ok(problems.some((p) => p.includes("was not found")));
});

test("validatePr rejects a closed referenced issue", () => {
  const issue = { number: 12, state: "closed", labels: ["type: feature"] };
  const problems = validatePr({ title: "feat: x", body: prBody(), issue });
  assert.ok(problems.some((p) => p.includes("is not open")));
});

test("validatePr rejects an issue carrying the invalid-format label", () => {
  const issue = { number: 12, state: "open", labels: ["type: feature", "invalid-format"] };
  const problems = validatePr({ title: "feat: x", body: prBody(), issue });
  assert.ok(problems.some((p) => p.includes("invalid-format")));
});

test("validatePr reports every missing PR section", () => {
  const body = ["## Issue", "Closes #12"].join("\n");
  const problems = validatePr({ title: "feat: x", body, issue: openFeatureIssue });
  assert.ok(problems.some((p) => p.includes("How")));
  assert.ok(problems.some((p) => p.includes("Technical decisions")));
  assert.ok(problems.some((p) => p.includes("How it was tested")));
  assert.ok(problems.some((p) => p.includes("Delivery impact")));
});

test("validatePr reports an empty non-checkbox section", () => {
  const problems = validatePr({
    title: "feat: x",
    body: prBody({ how: "_No response_" }),
    issue: openFeatureIssue,
  });
  assert.ok(problems.some((p) => p.includes("How") && p.includes("empty")));
});

test("validatePr requires at least one delivery impact box checked", () => {
  const body = prBody({
    impact:
      "- [ ] None\n- [ ] Postgres migration\n- [ ] SQLite migration\n- [ ] New event `schema_version`\n- [ ] Hardware adapter change",
  });
  const problems = validatePr({ title: "feat: x", body, issue: openFeatureIssue });
  assert.ok(problems.some((p) => p.toLowerCase().includes("at least one")));
});

test("validatePr rejects None combined with another delivery impact option", () => {
  const body = prBody({
    impact:
      "- [x] None\n- [x] Postgres migration\n- [ ] SQLite migration\n- [ ] New event `schema_version`\n- [ ] Hardware adapter change",
  });
  const problems = validatePr({ title: "feat: x", body, issue: openFeatureIssue });
  assert.ok(problems.some((p) => p.toLowerCase().includes("exclusive")));
});

test("validatePr accepts a non-None delivery impact selection alone", () => {
  const body = prBody({
    impact:
      "- [ ] None\n- [x] Postgres migration\n- [ ] SQLite migration\n- [ ] New event `schema_version`\n- [ ] Hardware adapter change",
  });
  const problems = validatePr({ title: "feat: x", body, issue: openFeatureIssue });
  assert.deepEqual(problems, []);
});

test("validatePr rejects a PR closing an issue that has sub-issues", () => {
  const issue = { number: 12, state: "open", labels: ["type: feature"], subIssuesTotal: 2 };
  const problems = validatePr({ title: "feat: x", body: prBody(), issue });
  assert.ok(problems.some((p) => p.includes("sub-issue") && p.toLowerCase().includes("instead")));
});

test("validatePr accepts a PR closing an issue with zero sub-issues", () => {
  const issue = { number: 12, state: "open", labels: ["type: feature"], subIssuesTotal: 0 };
  const problems = validatePr({ title: "feat: x", body: prBody(), issue });
  assert.deepEqual(problems, []);
});

const dependabotAuthor = { login: "dependabot[bot]", type: "Bot" };

test("validatePr exempts a well-formed Dependabot PR from the issue and sections requirement", () => {
  const problems = validatePr({
    title: "chore(deps): bump vitest from 3.2.0 to 3.3.0",
    body: "Bumps [vitest](https://github.com/vitest-dev/vitest) from 3.2.0 to 3.3.0.",
    issue: null,
    author: dependabotAuthor,
  });
  assert.deepEqual(problems, []);
});

test("validatePr accepts a ci-typed Dependabot PR (github-actions ecosystem)", () => {
  const problems = validatePr({
    title: "ci(deps): bump actions/checkout from 6 to 7",
    body: "Bumps actions/checkout from 6 to 7.",
    issue: null,
    author: dependabotAuthor,
  });
  assert.deepEqual(problems, []);
});

test("validatePr rejects a Dependabot PR with a non-Conventional-Commit title", () => {
  const problems = validatePr({
    title: "Bump vitest from 3.2.0 to 3.3.0",
    body: "Bumps vitest from 3.2.0 to 3.3.0.",
    issue: null,
    author: dependabotAuthor,
  });
  assert.ok(problems.some((p) => p.toLowerCase().includes("conventional commit")));
});

test("validatePr rejects a Dependabot PR whose title uses a non-dependency type", () => {
  const problems = validatePr({
    title: "feat: bump vitest from 3.2.0 to 3.3.0",
    body: "Bumps vitest from 3.2.0 to 3.3.0.",
    issue: null,
    author: dependabotAuthor,
  });
  assert.ok(
    problems.some((p) => p.toLowerCase().includes("chore") || p.toLowerCase().includes("ci")),
  );
});

test("validatePr still requires the issue and sections for a human PR that mimics Dependabot's title", () => {
  const problems = validatePr({
    title: "chore(deps): bump vitest from 3.2.0 to 3.3.0",
    body: "Bumps vitest from 3.2.0 to 3.3.0.",
    issue: null,
    author: { login: "dependabot[bot]", type: "User" },
  });
  assert.ok(problems.some((p) => p.toLowerCase().includes("exactly one")));
});

test("validatePrBodyLocal accepts a well-formed body and title with no network data", () => {
  const problems = validatePrBodyLocal({ title: "feat: add discounts", body: prBody() });
  assert.deepEqual(problems, []);
});

test("validatePrBodyLocal skips the title check when no title is given (e.g. gh pr edit without --title)", () => {
  const problems = validatePrBodyLocal({ body: prBody() });
  assert.deepEqual(problems, []);
});

test("validatePrBodyLocal reports a non-Conventional-Commit title when one is given", () => {
  const problems = validatePrBodyLocal({ title: "add discounts", body: prBody() });
  assert.ok(problems.some((p) => p.toLowerCase().includes("conventional commit")));
});

test("validatePrBodyLocal never checks issue existence, state, type match, or sub-issues", () => {
  // No `issue` input exists for this function at all; a well-formed body and
  // title pass regardless of what the (unreachable) referenced issue looks
  // like on GitHub.
  const problems = validatePrBodyLocal({ title: "feat: x", body: prBody() });
  assert.deepEqual(problems, []);
});

test("validatePrBodyLocal still requires exactly one Closes reference", () => {
  const problems = validatePrBodyLocal({ title: "feat: x", body: prBody({ issueRef: "" }) });
  assert.ok(problems.some((p) => p.toLowerCase().includes("exactly one")));
});

test("validatePrBodyLocal still requires every section and the Delivery impact rule", () => {
  const problems = validatePrBodyLocal({
    title: "feat: x",
    body: ["## Issue", "Closes #12"].join("\n"),
  });
  assert.ok(problems.some((p) => p.includes("How")));
  assert.ok(problems.some((p) => p.includes("Delivery impact")));
});

test("validatePr still requires the issue and sections when author type is missing (defensive default)", () => {
  const problems = validatePr({
    title: "chore(deps): bump vitest from 3.2.0 to 3.3.0",
    body: "Bumps vitest from 3.2.0 to 3.3.0.",
    issue: null,
    author: { login: "dependabot[bot]" },
  });
  assert.ok(problems.some((p) => p.toLowerCase().includes("exactly one")));
});
