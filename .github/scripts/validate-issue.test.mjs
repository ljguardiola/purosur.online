import assert from "node:assert/strict";
import { test } from "node:test";
import { detectIssueType, validateIssue } from "./validate-issue.mjs";

const featureBody = [
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

test("detectIssueType reads the type from a `type: X` label", () => {
  assert.equal(detectIssueType(["type: feature", "priority: high"]), "feature");
  assert.equal(detectIssueType(["type: bug"]), "bug");
  assert.equal(detectIssueType(["type: spike"]), "spike");
  assert.equal(detectIssueType(["type: technical"]), "technical");
});

test("detectIssueType returns null when no recognized type label is present", () => {
  assert.equal(detectIssueType(["priority: high"]), null);
  assert.equal(detectIssueType([]), null);
});

test("validateIssue accepts a complete feature issue", () => {
  const problems = validateIssue({ body: featureBody, labels: ["type: feature"] });
  assert.deepEqual(problems, []);
});

test("validateIssue reports every missing section", () => {
  const problems = validateIssue({ body: "### Goal\nSomething.", labels: ["type: feature"] });
  assert.equal(problems.length, 3);
  assert.ok(problems.some((p) => p.includes("Business rules")));
  assert.ok(problems.some((p) => p.includes("Acceptance criteria (Given / When / Then)")));
  assert.ok(problems.some((p) => p.includes("Out of scope")));
});

test("validateIssue reports a present but empty section", () => {
  const body = featureBody.replace("Coupon codes.", "_No response_");
  const problems = validateIssue({ body, labels: ["type: feature"] });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("Out of scope"));
});

test("validateIssue reports a section left blank (not GitHub's placeholder)", () => {
  const body = featureBody.replace("Coupon codes.", "");
  const problems = validateIssue({ body, labels: ["type: feature"] });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("Out of scope"));
});

test("validateIssue requires a recognized type label", () => {
  const problems = validateIssue({ body: featureBody, labels: ["priority: high"] });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].toLowerCase().includes("type"));
});

test("validateIssue allows an empty Result section for a spike", () => {
  const body = [
    "### Question to answer",
    "Can we use SQLite WAL mode safely?",
    "",
    "### How it will be decided",
    "Prototype and benchmark.",
    "",
    "### Time box",
    "Two days.",
    "",
    "### Result",
    "_No response_",
  ].join("\n");
  const problems = validateIssue({ body, labels: ["type: spike"] });
  assert.deepEqual(problems, []);
});

test("validateIssue still requires the Result section to exist for a spike", () => {
  const body = [
    "### Question to answer",
    "Can we use SQLite WAL mode safely?",
    "",
    "### How it will be decided",
    "Prototype and benchmark.",
    "",
    "### Time box",
    "Two days.",
  ].join("\n");
  const problems = validateIssue({ body, labels: ["type: spike"] });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("Result"));
});

test("validateIssue validates a bug issue's sections", () => {
  const body = [
    "### Expected behavior",
    "The receipt prints.",
    "",
    "### Actual behavior",
    "Nothing happens.",
    "",
    "### Steps to reproduce",
    "Open a sale, tap print.",
    "",
    "### Where it happens (register or cloud, and version)",
    "Register, v1.2.0.",
    "",
    "### Impact on the store",
    "Cashier must write receipts by hand.",
  ].join("\n");
  assert.deepEqual(validateIssue({ body, labels: ["type: bug"] }), []);
});

test("validateIssue validates a technical issue's sections", () => {
  const body = [
    "### What and why",
    "Upgrade pnpm.",
    "",
    "### Definition of done",
    "CI passes on pnpm 10.",
  ].join("\n");
  assert.deepEqual(validateIssue({ body, labels: ["type: technical"] }), []);
});
