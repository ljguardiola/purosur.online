import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Editing this list is how you add, rename, or remove a domain concept.
const CONCEPTS = [
  "sales",
  "returns",
  "payments",
  "fiscal",
  "register",
  "stock",
  "pricing",
  "catalog",
  "sync",
  "purchasing",
  "alerts",
] as const;

const domainSrc = fileURLToPath(new URL(".", import.meta.url));

function topLevelDirectories(path: string) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("packages/domain/src shape", () => {
  it("has exactly the declared concepts as top-level directories", () => {
    const actual = topLevelDirectories(domainSrc);
    const expected = [...CONCEPTS].sort();

    const missing = expected.filter((concept) => !actual.includes(concept));
    const unexpected = actual.filter(
      (directory) => !expected.includes(directory as (typeof CONCEPTS)[number]),
    );

    expect(missing, `missing concept directories: ${missing.join(", ")}`).toEqual([]);
    expect(unexpected, `unexpected top-level directories: ${unexpected.join(", ")}`).toEqual([]);
  });

  it.each(CONCEPTS)("%s has both a model/ and a use-cases/ directory", (concept) => {
    const subdirectories = topLevelDirectories(`${domainSrc}${concept}`);

    expect(subdirectories).toContain("model");
    expect(subdirectories).toContain("use-cases");
  });
});
