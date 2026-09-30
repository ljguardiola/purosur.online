import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { parse } from "yaml";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const strykerBin = join(repoRoot, "node_modules/@stryker-mutator/core/bin/stryker.js");

const FIXTURE_SOURCE = `const NUMBER_FORMAT = new Intl.NumberFormat("es-AR");

export function isOverLimit(value: number): boolean {
  return value > 100;
}

export function isNegative(value: number): boolean {
  return value < 0;
}

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

export function isEven(value: number): boolean {
  return value % 2 === 0;
}

const LIMIT_NAMES = new Set(["low", "high"]);

export function isLimitName(value: unknown): boolean {
  return typeof value === "string" && LIMIT_NAMES.has(value);
}
`;

const FIXTURE_TEST = `import { describe, expect, it } from "vitest";
import { formatNumber, isLimitName, isNegative, isOverLimit } from "./limits.js";

describe("isOverLimit", () => {
  it("accepts the limit itself", () => {
    expect(isOverLimit(100)).toBe(false);
  });

  it("rejects one past the limit", () => {
    expect(isOverLimit(101)).toBe(true);
  });
});

describe("isNegative", () => {
  it("flags minus one", () => {
    expect(isNegative(-1)).toBe(true);
  });
});

describe("formatNumber", () => {
  it("groups thousands the Argentine way", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
  });
});

describe("isLimitName", () => {
  it("accepts every limit name and rejects any other value", () => {
    expect(isLimitName("low")).toBe(true);
    expect(isLimitName("high")).toBe(true);
    expect(isLimitName("none")).toBe(false);
    expect(isLimitName(42)).toBe(false);
  });
});
`;

const DOMAIN_FIXTURE_SOURCE = `export function isPositive(value: number): boolean {
  return value > 0;
}
`;

const DOMAIN_ENTRY_SOURCE = `export const LOWEST_LIMIT_NAME = "low";
`;

const CONTRACTS_USING_DOMAIN_SOURCE = `import { LOWEST_LIMIT_NAME } from "@purosur/domain";

export const lowestLimitName: "low" = LOWEST_LIMIT_NAME;
`;

const DOMAIN_FIXTURE_TEST = `import { expect, it } from "vitest";
import { isPositive } from "./sign.js";

it("flags one as positive", () => {
  expect(isPositive(1)).toBe(true);
});
`;

async function writeFixtureFile(root, relativePath, content) {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

async function runMutationOnFixture() {
  const dir = await mkdtemp(join(tmpdir(), "mutation testing "));
  try {
    await symlink(join(repoRoot, "node_modules"), join(dir, "node_modules"), "junction");
    await writeFixtureFile(dir, "packages/contracts/src/limits.ts", FIXTURE_SOURCE);
    await writeFixtureFile(dir, "packages/contracts/src/limits.test.ts", FIXTURE_TEST);
    await writeFixtureFile(dir, "packages/domain/src/sign.ts", DOMAIN_FIXTURE_SOURCE);
    await writeFixtureFile(dir, "packages/domain/src/sign.test.ts", DOMAIN_FIXTURE_TEST);
    await writeFixtureFile(dir, "packages/domain/src/index.ts", DOMAIN_ENTRY_SOURCE);
    await writeFixtureFile(
      dir,
      "packages/domain/package.json",
      JSON.stringify({
        name: "@purosur/domain",
        type: "module",
        exports: { ".": { "@purosur/source": "./src/index.ts" } },
      }),
    );
    await writeFixtureFile(
      dir,
      "packages/contracts/src/lowest-limit-name.ts",
      CONTRACTS_USING_DOMAIN_SOURCE,
    );
    await mkdir(join(dir, "packages/contracts/node_modules/@purosur"), { recursive: true });
    await symlink(
      "../../../domain",
      join(dir, "packages/contracts/node_modules/@purosur/domain"),
      "junction",
    );
    await writeFixtureFile(
      dir,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          customConditions: ["@purosur/source"],
        },
      }),
    );
    await writeFixtureFile(
      dir,
      "packages/contracts/tsconfig.json",
      `{ "extends": "../../tsconfig.json", "include": ["src/**/*.ts"] }\n`,
    );
    await writeFixtureFile(dir, ".env", "DATABASE_URL=postgres://local\n");
    await writeFixtureFile(dir, "apps/cloud/dist/server.js", "export {};\n");
    await cp(join(repoRoot, "vitest.mutation.config.ts"), join(dir, "vitest.mutation.config.ts"));
    await writeFixtureFile(
      dir,
      "stryker.fixture.config.mjs",
      [
        `import config from ${JSON.stringify(pathToFileURL(join(repoRoot, "stryker.config.mjs")).href)};`,
        "export default { ...config, concurrency: 2 };",
      ].join("\n"),
    );
    return spawnSync(process.execPath, [strykerBin, "run", "stryker.fixture.config.mjs"], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: process.env.PATH, NO_COLOR: "1" },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function reportedLines(output) {
  const plain = stripVTControlCharacters(output);
  const lines = new Set();
  for (const match of plain.matchAll(/^\[(?:Survived|NoCoverage)\] \w+\n(\S+):(\d+):\d+$/gm)) {
    lines.add(`${match[1]}:${match[2]}`);
  }
  return [...lines].sort();
}

const fixtureRun = await runMutationOnFixture();

test("reports every change no test catches with its file and line, and nothing a test or the type check catches, even across packages", () => {
  assert.deepEqual(
    reportedLines(fixtureRun.stdout),
    [
      "packages/contracts/src/limits.ts:16",
      "packages/contracts/src/limits.ts:8",
      "packages/domain/src/sign.ts:2",
    ],
    fixtureRun.stdout + fixtureRun.stderr,
  );
});

test("runs on a copy of the rule packages alone, leaving out local files such as secrets and builds", () => {
  const plain = stripVTControlCharacters(fixtureRun.stdout + fixtureRun.stderr);

  assert.match(plain, /Found 4 of 10 file\(s\) to be mutated/, plain);
});

test("fails the run when a change goes uncaught", () => {
  assert.notEqual(fixtureRun.status, 0, fixtureRun.stdout + fixtureRun.stderr);
});

const mutationWorkflow = parse(
  readFileSync(join(repoRoot, ".github/workflows/mutation.yml"), "utf8"),
);

test("no job of the scheduled run is a check a merge requires", () => {
  const ruleset = JSON.parse(readFileSync(join(repoRoot, ".github/rulesets/main.json"), "utf8"));
  const required = ruleset.rules
    .filter((rule) => rule.type === "required_status_checks")
    .flatMap((rule) => rule.parameters.required_status_checks.map((check) => check.context));
  const jobNames = Object.entries(mutationWorkflow.jobs).map(([id, job]) => job.name ?? id);

  assert.deepEqual(
    jobNames.filter((name) => required.includes(name)),
    [],
  );
});
