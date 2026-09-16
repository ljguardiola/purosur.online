// Pure decision logic that keeps a parent issue's state consistent with its
// GitHub sub-issues. The workflow only fetches issue and sub-issue data and
// applies the actions returned here.
//
// Every decision below reads each sub-issue's actual open/closed `state`
// (from the sub-issues list endpoint) rather than any completion summary, so
// a sub-issue closed as "not_planned" still counts as closed. Confirmed live
// against this repo: `sub_issues_summary.completed` already counts a
// not_planned close as completed, but the decision logic does not depend on
// that either way.

export function parseParentNumber(parent) {
  return parent ? parent.number : null;
}

export function allSubIssuesClosed(subIssues) {
  return (subIssues ?? []).every((subIssue) => subIssue.state === "closed");
}

export const OUT_OF_SYNC_COMMENT =
  "A parent issue closes automatically once its last sub-issue closes. " +
  "This issue still has an open sub-issue, so it has been reopened to keep it in sync.";

// An issue that has sub-issues (i.e. is itself a parent) was just closed.
// If any of its own sub-issues is still open, the close is inconsistent:
// reopen it and explain why.
export function decideOwnConsistency({ subIssues }) {
  if (subIssues && subIssues.length > 0 && !allSubIssuesClosed(subIssues)) {
    return { type: "reopen", comment: OUT_OF_SYNC_COMMENT };
  }
  return null;
}

// An issue with a parent was just closed. If the parent is open and every
// one of the parent's sub-issues (this one included) is now closed, the
// parent should close too.
export function decideParentOnChildClosed({ parent, parentSubIssues }) {
  if (parent?.state !== "open") {
    return null;
  }
  if (!allSubIssuesClosed(parentSubIssues)) {
    return null;
  }
  return { type: "close", issue: parent.number };
}

// An issue was reopened. A closed parent with a now-open sub-issue is
// inconsistent, so the parent must reopen too.
export function decideParentOnChildReopened({ parent }) {
  if (parent?.state !== "closed") {
    return null;
  }
  return { type: "reopen", issue: parent.number };
}
