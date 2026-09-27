import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contractsSrc = fileURLToPath(new URL(".", import.meta.url));
const domainSrc = fileURLToPath(new URL("../../domain/src/", import.meta.url));

function topLevelDirectoryNames(path: string) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function topLevelFileNames(path: string) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

describe("packages/contracts/src shape", () => {
  it("names every top-level folder after one of packages/domain's concepts", () => {
    const domainConcepts = topLevelDirectoryNames(domainSrc).filter((name) => name !== "shared");
    const contractsFolders = topLevelDirectoryNames(contractsSrc);

    const notAConcept = contractsFolders.filter((name) => !domainConcepts.includes(name));

    expect(notAConcept, `not a domain concept: ${notAConcept.join(", ")}`).toEqual([]);
  });

  it("keeps only its index and this test at the top level", () => {
    expect(topLevelFileNames(contractsSrc)).toEqual(["index.ts", "structure.test.ts"]);
  });
});
