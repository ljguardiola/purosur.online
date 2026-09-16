// Parses GitHub-rendered Markdown headings ("### Label" for issue forms,
// "## Label" for the PR template) into a Map of heading -> trimmed content.

export function parseSections(body, markerLevel) {
  const sections = new Map();
  if (!body) {
    return sections;
  }

  const marker = "#".repeat(markerLevel);
  const headingPattern = new RegExp(`^${marker}(?!#)\\s+(.+?)\\s*$`);

  const lines = body.split(/\r?\n/);
  let currentHeading = null;
  let currentLines = [];

  const flush = () => {
    if (currentHeading !== null) {
      sections.set(currentHeading, currentLines.join("\n").trim());
    }
  };

  for (const line of lines) {
    const match = headingPattern.exec(line);
    if (match) {
      flush();
      currentHeading = match[1];
      currentLines = [];
    } else if (currentHeading !== null) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

export function isEmptyContent(content) {
  if (content === null || content === undefined) {
    return true;
  }
  const trimmed = content.trim();
  return trimmed.length === 0 || trimmed === "_No response_";
}
