import { isEmptyContent, parseSections } from "./sections.mjs";
import { detectIssueType } from "./validate-issue.mjs";

const CONVENTIONAL_COMMIT_PATTERN = /^([a-z]+)(?:\([^)]+\))?!?:\s+\S.*$/;
const CLOSES_REFERENCE_PATTERN = /\b(?:closes|fixes|resolves)\s+#(\d+)/gi;

const COMMIT_TYPES_BY_ISSUE_TYPE = {
  feature: new Set(["feat"]),
  bug: new Set(["fix"]),
  technical: new Set(["chore", "refactor", "ci", "build", "test", "perf"]),
};

const DEPENDABOT_COMMIT_TYPES = new Set(["chore", "ci"]);

const REQUIRED_SECTIONS = [
  "Issue",
  "How",
  "Technical decisions",
  "How it was tested",
  "Delivery impact",
];
const DELIVERY_IMPACT_OPTIONS = new Set([
  "Postgres migration",
  "SQLite migration",
  "New event `schema_version`",
  "Hardware adapter change",
  "None",
]);

export function parseClosesReferences(body) {
  const references = [];
  for (const match of (body ?? "").matchAll(CLOSES_REFERENCE_PATTERN)) {
    references.push(Number(match[1]));
  }
  return references;
}

export function parseConventionalCommitType(title) {
  const match = CONVENTIONAL_COMMIT_PATTERN.exec((title ?? "").trim());
  return match ? match[1] : null;
}

export function isDependabotAuthor(author) {
  return author?.login === "dependabot[bot]" && author?.type === "Bot";
}

export function parseDeliveryImpactChecks(sectionContent) {
  const checked = new Set();
  const checkboxPattern = /^-\s*\[([ xX])\]\s*(.+?)\s*$/gm;
  for (const match of (sectionContent ?? "").matchAll(checkboxPattern)) {
    if (match[1].toLowerCase() === "x") {
      checked.add(match[2].trim());
    }
  }
  return checked;
}

function validateSections(body, problems) {
  const sections = parseSections(body, 2);
  for (const heading of REQUIRED_SECTIONS) {
    if (!sections.has(heading)) {
      problems.push(`Missing required section: "${heading}".`);
      continue;
    }
    if (heading === "Delivery impact") {
      continue;
    }
    if (isEmptyContent(sections.get(heading))) {
      problems.push(`Section "${heading}" is empty.`);
    }
  }
  return sections;
}

function validateDeliveryImpact(sections, problems) {
  if (!sections.has("Delivery impact")) {
    return;
  }
  const checked = parseDeliveryImpactChecks(sections.get("Delivery impact"));
  const recognized = [...checked].filter((option) => DELIVERY_IMPACT_OPTIONS.has(option));

  if (recognized.length === 0) {
    problems.push("Delivery impact: at least one option must be checked.");
    return;
  }
  if (recognized.includes("None") && recognized.length > 1) {
    problems.push(
      'Delivery impact: "None" is exclusive and cannot be combined with other options.',
    );
  }
}

function validateReferenceCount(body, problems) {
  const references = parseClosesReferences(body);

  if (references.length === 0) {
    problems.push('PR body must reference exactly one issue with "Closes #N" (or Fixes/Resolves).');
  } else if (references.length > 1) {
    problems.push(`PR body references ${references.length} issues; exactly one is required.`);
  }

  return references;
}

function validateIssueReference({ body, commitType, issue, problems }) {
  const references = validateReferenceCount(body, problems);
  if (references.length !== 1) {
    return;
  }

  const [referencedNumber] = references;
  if (!issue) {
    problems.push(`Referenced issue #${referencedNumber} was not found.`);
    return;
  }

  if (issue.state !== "open") {
    problems.push(`Referenced issue #${issue.number} is not open.`);
  }
  if ((issue.labels ?? []).includes("invalid-format")) {
    problems.push(`Referenced issue #${issue.number} carries the "invalid-format" label.`);
  }

  if ((issue.subIssuesTotal ?? 0) > 0) {
    problems.push(
      `Referenced issue #${issue.number} has sub-issues; a PR must close one of its sub-issues instead.`,
    );
    return;
  }

  const issueType = detectIssueType(issue.labels ?? []);
  if (issueType === "spike") {
    problems.push("Spikes do not merge code; a PR must not reference a spike issue.");
    return;
  }
  if (issueType === null) {
    problems.push(`Referenced issue #${issue.number} has no recognized type label.`);
    return;
  }
  if (commitType !== null) {
    const allowedCommitTypes = COMMIT_TYPES_BY_ISSUE_TYPE[issueType];
    if (!allowedCommitTypes.has(commitType)) {
      problems.push(`PR title type "${commitType}" does not match issue type "${issueType}".`);
    }
  }
}

// The subset of validatePr's checks that need no network lookup: title
// convention (only when a title is available), section presence/emptiness,
// the Delivery impact rule, and the single-Closes-reference rule. Callers
// without repository access (such as a local pre-command guard) use this
// instead of validatePr, and must still tell the operator that CI performs
// the remaining, non-local checks (issue existence, state, type match, and
// sub-issues).
export function validatePrBodyLocal({ title, body }) {
  const problems = [];

  if (title !== undefined && title !== null) {
    const commitType = parseConventionalCommitType(title);
    if (commitType === null) {
      problems.push('PR title is not a Conventional Commit (expected "type(scope)!: subject").');
    }
  }

  validateReferenceCount(body, problems);

  const sections = validateSections(body, problems);
  validateDeliveryImpact(sections, problems);

  return problems;
}

export function validatePr({ title, body, issue, author }) {
  const problems = [];

  const commitType = parseConventionalCommitType(title);
  if (commitType === null) {
    problems.push('PR title is not a Conventional Commit (expected "type(scope)!: subject").');
  }

  if (isDependabotAuthor(author)) {
    if (commitType !== null && !DEPENDABOT_COMMIT_TYPES.has(commitType)) {
      problems.push(`A Dependabot PR title type must be "chore" or "ci", got "${commitType}".`);
    }
    return problems;
  }

  validateIssueReference({ body, commitType, issue, problems });

  const sections = validateSections(body, problems);
  validateDeliveryImpact(sections, problems);

  return problems;
}
