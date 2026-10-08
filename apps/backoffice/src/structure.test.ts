import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
];
const OUTSIDE_ANY_CONCEPT = ["help", "platform", "shell"];
const ROOT_FILES = ["env.d.ts", "main.tsx", "structure.test.ts"];

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

describe("apps/backoffice/src shape", () => {
  it("has the business concepts and the folders that belong to no concept as its only folders", () => {
    const folders = entriesOf(src)
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(folders).toEqual([...CONCEPTS, ...OUTSIDE_ANY_CONCEPT].sort());
  });

  it("keeps only the entry point and its declarations at the top level", () => {
    const files = entriesOf(src)
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    expect(files).toEqual(ROOT_FILES);
  });

  it("names every file and folder in kebab-case", () => {
    const notKebabCase = allNamesUnder(src).filter((name) => !isKebabCase(name));

    expect(notKebabCase).toEqual([]);
  });
});
