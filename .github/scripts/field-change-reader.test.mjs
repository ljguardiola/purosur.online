import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCli } from "./field-change-reader.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function writeTracked(dir, relativePath, content) {
  const fullPath = join(dir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  git(["add", relativePath], dir);
}

function commit(dir, message) {
  git(
    ["-c", "user.name=Ada Lucero", "-c", "user.email=ada@example.com", "commit", "-qm", message],
    dir,
  );
}

const DOMAIN_PACKAGE = JSON.stringify({
  name: "@purosur/domain",
  type: "module",
  exports: { ".": { "@purosur/source": "./src/index.ts", default: "./dist/index.js" } },
});

const CONTRACTS_PACKAGE = JSON.stringify({
  name: "@purosur/contracts",
  type: "module",
  dependencies: { "@purosur/domain": "workspace:*", zod: "^4.6.5" },
});

function unitsModule(units) {
  return `export const UNITS = ${JSON.stringify(units)} as const;\n`;
}

const CHANGES = [
  'import { isUnit } from "@purosur/domain";',
  'import { z } from "zod";',
  'import { recordIdSchema } from "../shared/index.js";',
  "",
  "export const changesQuerySchema = z.object({ since: z.number() });",
  "",
  "export const changesPageSchema = z.object({",
  "  changes: z.array(z.object({ entity_id: recordIdSchema, unit: z.custom<string>(isUnit) })),",
  "});",
  "",
].join("\n");

async function withReleaseRepo(run) {
  const dir = mkdtempSync(join(tmpdir(), "field-change-reader-"));
  try {
    git(["init", "-q", "-b", "main"], dir);
    writeTracked(dir, "apps/pos/package.json", JSON.stringify({ version: "2.3.0" }));
    writeTracked(dir, "packages/domain/package.json", DOMAIN_PACKAGE);
    writeTracked(dir, "packages/domain/src/index.ts", 'export { isUnit } from "./units.js";\n');
    writeTracked(
      dir,
      "packages/domain/src/units.ts",
      [
        'import { UNITS } from "./unit-list.js";',
        "",
        "export function isUnit(value: unknown): boolean {",
        "  return (UNITS as readonly unknown[]).includes(value);",
        "}",
        "",
      ].join("\n"),
    );
    writeTracked(dir, "packages/domain/src/unit-list.ts", unitsModule(["G", "KG"]));
    writeTracked(dir, "packages/contracts/package.json", CONTRACTS_PACKAGE);
    writeTracked(
      dir,
      "packages/contracts/src/shared/index.ts",
      'import { z } from "zod";\n\nexport const recordIdSchema = z.string().min(1);\n',
    );
    writeTracked(dir, "packages/contracts/src/sync/changes.ts", CHANGES);
    commit(dir, "the release");
    git(["tag", "pos-v2.3.4"], dir);
    writeTracked(dir, "packages/domain/src/unit-list.ts", unitsModule(["G", "KG", "L"]));
    commit(dir, "after the release");

    const outDir = join(dir, "readers");
    mkdirSync(outDir);
    symlinkSync(join(repoRoot, "packages/contracts/node_modules"), join(outDir, "node_modules"));
    await run({ dir, outDir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function silently(dir, outDir, argv) {
  const errors = [];
  return {
    errors,
    run: () =>
      runCli({ argv, repoDir: dir, outDir, log: () => {}, logError: (line) => errors.push(line) }),
  };
}

test("writes the tag's change-page reader to a file named after the version its register reports", async () => {
  await withReleaseRepo(async ({ dir, outDir }) => {
    const { run } = silently(dir, outDir, ["pos-v2.3.4", "77"]);

    assert.equal(await run(), 0);

    const reader = await import(pathToFileURL(join(outDir, "2.3.77.js")).href);
    assert.deepEqual(Object.keys(reader), ["changesPageSchema"]);
    assert.equal(
      reader.changesPageSchema.safeParse({ changes: [{ entity_id: "a", unit: "KG" }] }).success,
      true,
    );
  });
});

test("the reader applies the rules of the tag, not those of the commits after it", async () => {
  await withReleaseRepo(async ({ dir, outDir }) => {
    const { run } = silently(dir, outDir, ["pos-v2.3.4", "77"]);
    await run();

    const reader = await import(pathToFileURL(join(outDir, "2.3.77.js")).href);
    for (const unit of ["L", "furlong"]) {
      assert.equal(
        reader.changesPageSchema.safeParse({ changes: [{ entity_id: "a", unit }] }).success,
        false,
      );
    }
    assert.equal(
      reader.changesPageSchema.safeParse({ changes: [{ entity_id: "", unit: "G" }] }).success,
      false,
    );
  });
});

test("the reader carries everything it needs but zod, and names the tag and the command that made it", async () => {
  await withReleaseRepo(async ({ dir, outDir }) => {
    const { run } = silently(dir, outDir, ["pos-v2.3.4", "77"]);
    await run();

    const source = readFileSync(join(outDir, "2.3.77.js"), "utf8");
    const [firstLine] = source.split("\n");
    assert.match(firstLine, /pos-v2\.3\.4/);
    assert.match(firstLine, /`node \.github\/scripts\/field-change-reader\.mjs pos-v2\.3\.4 77`/);
    assert.deepEqual(
      [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, from]) => from),
      ["zod"],
    );
  });
});

test("generating the reader of a tag again writes the same file", async () => {
  await withReleaseRepo(async ({ dir, outDir }) => {
    const { run } = silently(dir, outDir, ["pos-v2.3.4", "77"]);
    await run();
    const first = readFileSync(join(outDir, "2.3.77.js"), "utf8");

    await run();

    assert.equal(readFileSync(join(outDir, "2.3.77.js"), "utf8"), first);
  });
});

for (const [argv, problem] of [
  [[], /a pos release tag and the run number/],
  [["pos-v2.3.4"], /a pos release tag and the run number/],
  [["v2.3.4", "77"], /"v2\.3\.4" is not a pos release tag/],
  [["pos-v2.3.4", "0"], /"0" is not a run number/],
  [["pos-v9.9.9", "77"], /pos-v9\.9\.9/],
]) {
  test(`refuses ${JSON.stringify(argv)} and writes no reader`, async () => {
    await withReleaseRepo(async ({ dir, outDir }) => {
      const { run, errors } = silently(dir, outDir, argv);

      assert.equal(await run(), 1);

      assert.match(errors.join("\n"), problem);
      assert.deepEqual(readdirSync(outDir), ["node_modules"]);
    });
  });
}
