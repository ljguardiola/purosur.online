import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allSubIssuesClosed,
  decideOwnConsistency,
  decideParentOnChildClosed,
  decideParentOnChildReopened,
  parseParentNumber,
} from "./parent-issue.mjs";

test("parseParentNumber reads the number off a GraphQL parent object", () => {
  assert.equal(parseParentNumber({ number: 15 }), 15);
});

test("parseParentNumber returns null when there is no parent", () => {
  assert.equal(parseParentNumber(null), null);
  assert.equal(parseParentNumber(undefined), null);
});

test("allSubIssuesClosed is true for an empty list", () => {
  assert.equal(allSubIssuesClosed([]), true);
  assert.equal(allSubIssuesClosed(undefined), true);
});

test("allSubIssuesClosed is true only when every sub-issue's state is closed", () => {
  assert.equal(
    allSubIssuesClosed([
      { number: 1, state: "closed" },
      { number: 2, state: "closed" },
    ]),
    true,
  );
  assert.equal(
    allSubIssuesClosed([
      { number: 1, state: "closed" },
      { number: 2, state: "open" },
    ]),
    false,
  );
});

test("allSubIssuesClosed counts a sub-issue closed as not_planned as closed, by state alone", () => {
  // The decision logic reads each sub-issue's actual open/closed state
  // instead of a summary, so it never depends on how any summary field
  // buckets a not_planned close.
  assert.equal(
    allSubIssuesClosed([
      { number: 1, state: "closed", state_reason: "completed" },
      { number: 2, state: "closed", state_reason: "not_planned" },
    ]),
    true,
  );
});

test("decideOwnConsistency does nothing for an issue with no sub-issues", () => {
  assert.equal(decideOwnConsistency({ subIssues: [] }), null);
});

test("decideOwnConsistency does nothing when every sub-issue is closed", () => {
  const subIssues = [
    { number: 1, state: "closed" },
    { number: 2, state: "closed" },
  ];
  assert.equal(decideOwnConsistency({ subIssues }), null);
});

test("decideOwnConsistency reopens the issue with a comment when a sub-issue is still open", () => {
  const subIssues = [
    { number: 1, state: "closed" },
    { number: 2, state: "open" },
  ];
  const decision = decideOwnConsistency({ subIssues });
  assert.equal(decision.type, "reopen");
  assert.equal(typeof decision.comment, "string");
  assert.ok(decision.comment.length > 0);
});

test("decideParentOnChildClosed does nothing when there is no parent", () => {
  assert.equal(decideParentOnChildClosed({ parent: null, parentSubIssues: [] }), null);
});

test("decideParentOnChildClosed does nothing when the parent is already closed", () => {
  const parent = { number: 15, state: "closed" };
  const parentSubIssues = [{ number: 16, state: "closed" }];
  assert.equal(decideParentOnChildClosed({ parent, parentSubIssues }), null);
});

test("decideParentOnChildClosed does nothing while a sibling sub-issue is still open", () => {
  const parent = { number: 15, state: "open" };
  const parentSubIssues = [
    { number: 16, state: "closed" },
    { number: 17, state: "open" },
  ];
  assert.equal(decideParentOnChildClosed({ parent, parentSubIssues }), null);
});

test("decideParentOnChildClosed closes the open parent once every sub-issue is closed", () => {
  const parent = { number: 15, state: "open" };
  const parentSubIssues = [
    { number: 16, state: "closed" },
    { number: 17, state: "closed" },
  ];
  const decision = decideParentOnChildClosed({ parent, parentSubIssues });
  assert.deepEqual(decision, { type: "close", issue: 15 });
});

test("decideParentOnChildClosed closes the parent even when a sub-issue closed as not_planned", () => {
  const parent = { number: 15, state: "open" };
  const parentSubIssues = [
    { number: 16, state: "closed", state_reason: "completed" },
    { number: 17, state: "closed", state_reason: "not_planned" },
  ];
  const decision = decideParentOnChildClosed({ parent, parentSubIssues });
  assert.deepEqual(decision, { type: "close", issue: 15 });
});

test("decideParentOnChildReopened does nothing when there is no parent", () => {
  assert.equal(decideParentOnChildReopened({ parent: null }), null);
});

test("decideParentOnChildReopened does nothing when the parent is already open", () => {
  assert.equal(decideParentOnChildReopened({ parent: { number: 15, state: "open" } }), null);
});

test("decideParentOnChildReopened reopens a closed parent", () => {
  const decision = decideParentOnChildReopened({ parent: { number: 15, state: "closed" } });
  assert.deepEqual(decision, { type: "reopen", issue: 15 });
});
