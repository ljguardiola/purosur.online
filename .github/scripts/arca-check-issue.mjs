export const ARCA_CHECK_ISSUE_LABEL = "arca-test-environment-down";

const TITLE = "The tax authority's test environment check is failing";

function quoted(output) {
  const longestBacktickRun = Math.max(0, ...[...output.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}\n${output}\n${fence}`;
}

function failureReport(output, runUrl) {
  const trimmed = output.trim();
  const found =
    trimmed === ""
      ? "The check did not report what it found; the run's log says why."
      : quoted(trimmed);
  return `${found}\n\nRun: ${runUrl}`;
}

function openedIssueBody(output, runUrl) {
  return [
    "### Expected behavior",
    "",
    "The scheduled check of the tax authority's test environment passes: FEDummy answers OK for every server, and the WSAA login issues a ticket or says one is still valid.",
    "",
    "### Actual behavior",
    "",
    failureReport(output, runUrl),
    "",
    "### Steps to reproduce",
    "",
    'Run the "Check the tax authority\'s test environment" workflow from the Actions tab on `main`, or wait for its next scheduled run.',
    "",
    "### Where it happens (register or cloud, and version)",
    "",
    "Cloud: its WSAA and WSFE clients, called against the tax authority's test environment, at the commit of the run above.",
    "",
    "### Impact on the store",
    "",
    "None yet: the test environment answered differently before any register depends on it. If the same change reaches production, the cloud may stop obtaining tickets or invoicing.",
    "",
    "This issue closes on its own once the check passes again.",
  ].join("\n");
}

export function planArcaCheckIssue({ passed, output, runUrl, openIssues }) {
  const [oldest] = [...openIssues].sort((a, b) => a.number - b.number);
  if (passed) {
    return oldest === undefined
      ? { kind: "none" }
      : { kind: "close", issueNumber: oldest.number, body: `The check passed again: ${runUrl}` };
  }
  if (oldest === undefined) {
    return {
      kind: "open",
      title: TITLE,
      labels: ["type: bug", ARCA_CHECK_ISSUE_LABEL],
      body: openedIssueBody(output, runUrl),
    };
  }
  return {
    kind: "comment",
    issueNumber: oldest.number,
    body: `The check failed again.\n\n${failureReport(output, runUrl)}`,
  };
}
