import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contractsSrc = fileURLToPath(new URL(".", import.meta.url));
const domainSrc = fileURLToPath(new URL("../../domain/src/", import.meta.url));

function topLevelDirectoryNames(path: string) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function sourceFilesOutsideShared() {
  return readdirSync(contractsSrc, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(".ts") && !path.startsWith("shared/"));
}

function topLevelFileNames(path: string) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

describe("packages/contracts/src shape", () => {
  it("names every top-level folder after one of packages/domain's concepts, except shared", () => {
    const domainConcepts = topLevelDirectoryNames(domainSrc);
    const contractsFolders = topLevelDirectoryNames(contractsSrc).filter(
      (name) => name !== "shared",
    );

    const notAConcept = contractsFolders.filter((name) => !domainConcepts.includes(name));

    expect(notAConcept, `not a domain concept: ${notAConcept.join(", ")}`).toEqual([]);
  });

  it("keeps only its index and this test at the top level", () => {
    expect(topLevelFileNames(contractsSrc)).toEqual(["index.ts", "structure.test.ts"]);
  });

  it("reaches shared only through its own index", () => {
    expect(topLevelFileNames(`${contractsSrc}shared`)).toContain("index.ts");

    const reachingPastTheIndex = sourceFilesOutsideShared().filter((path) =>
      /from "(\.\.?\/)+shared\/(?!index\.js")/.test(readFileSync(`${contractsSrc}${path}`, "utf8")),
    );

    expect(
      reachingPastTheIndex,
      `not through shared/index: ${reachingPastTheIndex.join(", ")}`,
    ).toEqual([]);
  });
});
