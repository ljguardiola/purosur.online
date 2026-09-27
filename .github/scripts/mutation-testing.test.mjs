import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { parse } from "yaml";
import mutationConfig from "../../stryker.config.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const strykerBin = join(repoRoot, "node_modules/@stryker-mutator/core/bin/stryker.js");
const RULE_PACKAGES = ["packages/domain/src/", "packages/contracts/src/"];

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
`;

const FIXTURE_TEST = `import { describe, expect, it } from "vitest";
import { formatNumber, isNegative, isOverLimit } from "./limits.js";

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
    await writeFixtureFile(dir, "src/limits.ts", FIXTURE_SOURCE);
    await writeFixtureFile(dir, "src/limits.test.ts", FIXTURE_TEST);
    await writeFixtureFile(
      dir,
      "vitest.config.mjs",
      `export default { test: { include: ["src/**/*.test.ts"] } };\n`,
    );
    await writeFixtureFile(
      dir,
      "stryker.config.mjs",
      [
        `import config from ${JSON.stringify(pathToFileURL(join(repoRoot, "stryker.config.mjs")).href)};`,
        "export default {",
        "  ...config,",
        `  mutate: ["src/**/*.ts", "!src/**/*.test.ts"],`,
        `  vitest: { ...config.vitest, configFile: "vitest.config.mjs" },`,
        "  concurrency: 2,",
        "};",
      ].join("\n"),
    );
    return spawnSync(process.execPath, [strykerBin, "run", "stryker.config.mjs"], {
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

test("reports every change no test catches with its file and line, and nothing a test catches", () => {
  assert.deepEqual(
    reportedLines(fixtureRun.stdout),
    ["src/limits.ts:15", "src/limits.ts:16", "src/limits.ts:8"],
    fixtureRun.stdout + fixtureRun.stderr,
  );
});

test("fails the run when a change goes uncaught", () => {
  assert.notEqual(fixtureRun.status, 0, fixtureRun.stdout + fixtureRun.stderr);
});

test("changes only the rules in packages/domain and packages/contracts, never their tests", () => {
  const included = mutationConfig.mutate.filter((pattern) => !pattern.startsWith("!"));
  const excluded = mutationConfig.mutate.filter((pattern) => pattern.startsWith("!"));

  assert.deepEqual(
    included.map((pattern) => RULE_PACKAGES.find((root) => pattern.startsWith(root))),
    RULE_PACKAGES,
  );
  assert.deepEqual(excluded, ["!packages/*/src/**/*.test.ts"]);
});

const mutationWorkflow = parse(
  readFileSync(join(repoRoot, ".github/workflows/mutation.yml"), "utf8"),
);

test("runs on a schedule or by hand, never on a pull request or a push", () => {
  assert.deepEqual(Object.keys(mutationWorkflow.on).sort(), ["schedule", "workflow_dispatch"]);
});

test("the scheduled run is the local mutation command", () => {
  const runs = Object.values(mutationWorkflow.jobs).flatMap((job) =>
    job.steps.map((step) => step.run?.trim()),
  );

  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

  assert.ok(runs.includes("pnpm mutation"), JSON.stringify(runs));
  assert.equal(packageJson.scripts.mutation, "stryker run stryker.config.mjs");
});

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
