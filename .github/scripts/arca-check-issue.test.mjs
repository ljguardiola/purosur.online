import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ARCA_CHECK_ISSUE_LABEL, planArcaCheckIssue } from "./arca-check-issue.mjs";
import { validateIssue } from "./validate-issue.mjs";

const RUN_URL = "https://github.com/owner/repo/actions/runs/42";
const FAILURE_OUTPUT = [
  "FEDummy: AppServer OK, DbServer NO, AuthServer OK",
  "loginCms: issued a ticket",
].join("\n");

function failedRun(openIssues = []) {
  return planArcaCheckIssue({
    passed: false,
    output: FAILURE_OUTPUT,
    runUrl: RUN_URL,
    openIssues,
  });
}

test("a failed run with no open issue opens one, labeled as a bug of the check", () => {
  const plan = failedRun();

  assert.equal(plan.kind, "open");
  assert.equal(plan.title, "The tax authority's test environment check is failing");
  assert.deepEqual(plan.labels, ["type: bug", ARCA_CHECK_ISSUE_LABEL]);
});

test("the opened issue names what failed and links the run", () => {
  const { body } = failedRun();

  assert.ok(body.includes("FEDummy: AppServer OK, DbServer NO, AuthServer OK"));
  assert.ok(body.includes(RUN_URL));
});

test("the opened issue follows the bug form, so it is not marked as badly formatted", () => {
  const { body, labels } = failedRun();

  assert.deepEqual(validateIssue({ body, labels }), []);
});

test("a failed run whose check printed nothing says so instead of an empty report", () => {
  const plan = planArcaCheckIssue({
    passed: false,
    output: "  \n",
    runUrl: RUN_URL,
    openIssues: [],
  });

  assert.ok(plan.body.includes("did not report what it found"));
});

test("a failure output holding backticks cannot close the block that quotes it", () => {
  const plan = planArcaCheckIssue({
    passed: false,
    output: "loginCms: failed with ```x``` y",
    runUrl: RUN_URL,
    openIssues: [],
  });

  const fence = /^(`{3,})$/m.exec(plan.body)?.[1];
  assert.ok(fence !== undefined && fence.length > 3);
});

test("a failed run with the issue already open comments on it instead of opening another", () => {
  const plan = failedRun([{ number: 7 }]);

  assert.equal(plan.kind, "comment");
  assert.equal(plan.issueNumber, 7);
  assert.ok(plan.body.includes("DbServer NO"));
  assert.ok(plan.body.includes(RUN_URL));
});

test("with more than one issue open, the oldest one gets the comment", () => {
  const plan = failedRun([{ number: 12 }, { number: 7 }]);

  assert.equal(plan.issueNumber, 7);
});

test("a passing run closes the open issue, linking the run that passed", () => {
  const plan = planArcaCheckIssue({
    passed: true,
    output: "",
    runUrl: RUN_URL,
    openIssues: [{ number: 7 }],
  });

  assert.equal(plan.kind, "close");
  assert.equal(plan.issueNumber, 7);
  assert.ok(plan.body.includes(RUN_URL));
});

test("a passing run with no open issue does nothing", () => {
  const plan = planArcaCheckIssue({ passed: true, output: "", runUrl: RUN_URL, openIssues: [] });

  assert.deepEqual(plan, { kind: "none" });
});

test("the check's label is defined with the repository's labels", () => {
  const labels = JSON.parse(readFileSync(new URL("../labels.json", import.meta.url), "utf8"));

  assert.ok(labels.some((label) => label.name === ARCA_CHECK_ISSUE_LABEL));
});
