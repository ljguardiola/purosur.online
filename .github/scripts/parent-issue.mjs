// GitHub's sub-issues list endpoint reports a `state` of "closed" for a sub-issue closed as
// not_planned too, confirmed live against this repo's API.

export function parseParentNumber(parent) {
  return parent ? parent.number : null;
}

export function allSubIssuesClosed(subIssues) {
  return (subIssues ?? []).every((subIssue) => subIssue.state === "closed");
}

export const OUT_OF_SYNC_COMMENT =
  "A parent issue closes automatically once its last sub-issue closes. " +
  "This issue still has an open sub-issue, so it has been reopened to keep it in sync.";

export function decideOwnConsistency({ subIssues }) {
  if (subIssues && subIssues.length > 0 && !allSubIssuesClosed(subIssues)) {
    return { type: "reopen", comment: OUT_OF_SYNC_COMMENT };
  }
  return null;
}

export function decideParentOnChildClosed({ parent, parentSubIssues }) {
  if (parent?.state !== "open") {
    return null;
  }
  if (!allSubIssuesClosed(parentSubIssues)) {
    return null;
  }
  return { type: "close", issue: parent.number };
}

export function decideParentOnChildReopened({ parent }) {
  if (parent?.state !== "closed") {
    return null;
  }
  return { type: "reopen", issue: parent.number };
}
