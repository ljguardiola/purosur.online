import { readdirSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const CONCEPTS = [
  "access",
  "alerts",
  "branch",
  "catalog",
  "fiscal",
  "payments",
  "permissions",
  "pricing",
  "register",
  "sales",
  "stock",
  "sync",
];
const OUTSIDE_ANY_CONCEPT = ["platform", "sample-data", "test-support"];
const ENTRY_POINTS = [
  "app.ts",
  "check-arca-test-environment.ts",
  "clear-sample-data.ts",
  "create-first-administrator.ts",
  "load-sample-data.ts",
  "migrate.ts",
  "record-arca-responses.ts",
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

  it("builds every source file except the tests and the helpers kept in test-support folders", () => {
    const build = ts.getParsedCommandLineOfConfigFile(
      fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        },
      },
    );
    const built = build?.fileNames.map((path) => relative(src, path)).sort();
    const nonTestSources = readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
      .filter((path) => !path.split(sep).includes("test-support"))
      .sort();

    expect(built).toEqual(nonTestSources);
  });

  it("names every file and folder in kebab-case", () => {
    const notKebabCase = allNamesUnder(src).filter((name) => !isKebabCase(name));

    expect(notKebabCase).toEqual([]);
  });
});
