import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const CONCEPTS = ["access", "alerts", "branch", "catalog", "fiscal", "pricing", "register"];
const OUTSIDE_ANY_CONCEPT = ["platform", "sample-data", "test-support"];
const ENTRY_POINTS = [
  "app.ts",
  "clear-sample-data.ts",
  "create-first-administrator.ts",
  "load-sample-data.ts",
  "migrate.ts",
  "server.ts",
  "wait-for-ready.ts",
];

const KEBAB_CASE_SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const src = fileURLToPath(new URL(".", import.meta.url));

function entriesOf(path: string) {
  return readdirSync(path, { withFileTypes: true });
}

function allNamesUnder(path: string): string[] {
  return entriesOf(path).flatMap((entry) => {
    const relative = `${path}/${entry.name}`;
    return entry.isDirectory() ? [`${entry.name}/`, ...allNamesUnder(relative)] : [entry.name];
  });
}

function isKebabCase(name: string): boolean {
  const withoutSlash = name.endsWith("/") ? name.slice(0, -1) : name;
  return withoutSlash.split(".").every((segment) => KEBAB_CASE_SEGMENT.test(segment));
}

describe("apps/cloud/src shape", () => {
  it("has the business concepts and the folders that belong to no concept as its only folders", () => {
    const folders = entriesOf(src)
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(folders).toEqual([...CONCEPTS, ...OUTSIDE_ANY_CONCEPT].sort());
  });

  it("keeps only the process entry points and their tests at the top level", () => {
    const sources = entriesOf(src)
      .filter((entry) => entry.isFile() && !entry.name.endsWith(".test.ts"))
      .map((entry) => entry.name)
      .sort();

    expect(sources).toEqual(ENTRY_POINTS);
  });

  it("keeps every test-only helper in a test-support folder, the only source left out of the build", () => {
    const tsconfig = ts.readConfigFile(
      fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
      ts.sys.readFile,
    );

    expect(tsconfig.config.exclude).toEqual(["src/**/*.test.ts", "src/**/test-support/**"]);
  });

  it("names every file and folder in kebab-case", () => {
    const notKebabCase = allNamesUnder(src).filter((name) => !isKebabCase(name));

    expect(notKebabCase).toEqual([]);
  });
});
