import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import strykerConfig from "../../stryker.config.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const strykerBin = join(repoRoot, "node_modules/@stryker-mutator/core/bin/stryker.js");

const RULE_SOURCE = `export function isPositive(value: number): boolean {
  return value > 0;
}
`;

const RULE_TEST = `import { expect, it } from "vitest";
import { isPositive } from "./sign.js";

it("tells positive values from zero and negative ones", () => {
  expect(isPositive(1)).toBe(true);
  expect(isPositive(0)).toBe(false);
  expect(isPositive(-1)).toBe(false);
});
`;

const SCREEN_PACKAGE_SOURCE = `import { render } from "a-screen-library-not-installed";

export const screen = render();
`;

async function writeFixtureFile(root, relativePath, content) {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

async function copyFromRepo(root, relativePath) {
  await mkdir(dirname(join(root, relativePath)), { recursive: true });
  await cp(join(repoRoot, relativePath), join(root, relativePath));
}

async function runMutationBesideAPackageWithoutItsDependencies() {
  const dir = await mkdtemp(join(tmpdir(), "mutation type check "));
  try {
    await symlink(join(repoRoot, "node_modules"), join(dir, "node_modules"), "junction");
    await writeFixtureFile(dir, "packages/contracts/src/sign.ts", RULE_SOURCE);
    await writeFixtureFile(dir, "packages/contracts/src/sign.test.ts", RULE_TEST);
    await writeFixtureFile(dir, "packages/ui/src/screen.ts", SCREEN_PACKAGE_SOURCE);
    for (const configFile of new Set([
      "tsconfig.json",
      strykerConfig.tsconfigFile,
      "vitest.mutation.config.ts",
      ".github/scripts/without-package-output.mjs",
      ".github/scripts/without-package-output.d.mts",
    ])) {
      await copyFromRepo(dir, configFile);
    }
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

test("tests every mutant of the rule packages even when another package's dependencies are not installed", async () => {
  const run = await runMutationBesideAPackageWithoutItsDependencies();
  const output = stripVTControlCharacters(run.stdout + run.stderr);

  assert.equal(run.status, 0, output);
  assert.match(output, /Final mutation score of 100\.00/, output);
});
