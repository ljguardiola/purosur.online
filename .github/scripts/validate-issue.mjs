import { isEmptyContent, parseSections } from "./sections.mjs";

const TYPE_LABEL_PREFIX = "type: ";

const SECTIONS_BY_TYPE = {
  feature: ["Goal", "Business rules", "Acceptance criteria (Given / When / Then)", "Out of scope"],
  bug: [
    "Expected behavior",
    "Actual behavior",
    "Steps to reproduce",
    "Where it happens (register or cloud, and version)",
    "Impact on the store",
  ],
  spike: ["Question to answer", "How it will be decided", "Time box", "Result"],
  technical: ["What and why", "Definition of done"],
};

// A spike's Result section records the outcome and may still be empty
// while the spike is open.
const SECTIONS_ALLOWED_EMPTY = {
  spike: new Set(["Result"]),
};

export function detectIssueType(labels) {
  for (const label of labels ?? []) {
    if (label.startsWith(TYPE_LABEL_PREFIX)) {
      const type = label.slice(TYPE_LABEL_PREFIX.length).trim();
      if (type in SECTIONS_BY_TYPE) {
        return type;
      }
    }
  }
  return null;
}

export function validateIssue({ body, labels }) {
  const problems = [];

  const type = detectIssueType(labels);
  if (type === null) {
    problems.push(
      "Issue has no recognized type label (type: feature, type: bug, type: spike, or type: technical).",
    );
    return problems;
  }

  const sections = parseSections(body, 3);
  const allowedEmpty = SECTIONS_ALLOWED_EMPTY[type] ?? new Set();

  for (const heading of SECTIONS_BY_TYPE[type]) {
    if (!sections.has(heading)) {
      problems.push(`Missing required section: "${heading}".`);
      continue;
    }
    if (allowedEmpty.has(heading)) {
      continue;
    }
    if (isEmptyContent(sections.get(heading))) {
      problems.push(`Section "${heading}" is empty.`);
    }
  }

  return problems;
}
