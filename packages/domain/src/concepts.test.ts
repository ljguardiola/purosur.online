import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONCEPTS = [
  "access",
  "permissions",
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
  "branch",
] as const;

const OUTSIDE_ANY_CONCEPT = ["shared"];

const domainSrc = fileURLToPath(new URL(".", import.meta.url));

function topLevelDirectories(path: string) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("packages/domain/src shape", () => {
  it("has exactly the declared concepts and the folders that belong to no concept as top-level directories", () => {
    const actual = topLevelDirectories(domainSrc);
    const expected = [...CONCEPTS, ...OUTSIDE_ANY_CONCEPT].sort();

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
