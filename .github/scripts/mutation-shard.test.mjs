import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { filesToMutate, runCli, shardOfFiles } from "./mutation-shard.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const { default: strykerConfig } = await import(
  pathToFileURL(join(repoRoot, "stryker.config.mjs")).href
);

const RULE_PACKAGE_FILES = [
  "packages/contracts/src/access/open-session.ts",
  "packages/contracts/src/index.ts",
  "packages/domain/src/catalog/model/ean13.ts",
  "packages/domain/src/catalog/use-cases/create-product.ts",
  "packages/domain/src/index.ts",
];

const FILES_LEFT_UNMUTATED = [
  "packages/contracts/src/access/open-session.test.ts",
  "packages/domain/src/catalog/model/ean13.test.ts",
  "packages/domain/src/catalog/use-cases/test-support/fake-catalog-store.ts",
  "packages/domain/src/test-support/fictional-names.ts",
  "packages/domain/package.json",
  "packages/ui/src/button.ts",
  "apps/cloud/src/catalog/products-routes.ts",
  "packages/contracts/src/access/open-session.tsx",
];

async function withRepository(run) {
  const dir = await mkdtemp(join(tmpdir(), "mutation shard "));
  try {
    for (const file of [...RULE_PACKAGE_FILES, ...FILES_LEFT_UNMUTATED]) {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), "export {};\n");
    }
    await writeFile(
      join(dir, "stryker.config.mjs"),
      `export default ${JSON.stringify({ mutate: strykerConfig.mutate })};\n`,
    );
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runInShard(dir, env) {
  const out = [];
  const errors = [];
  return runCli({
    cwd: dir,
    env,
    log: (line) => out.push(line),
    logError: (line) => errors.push(line),
  }).then((status) => ({ status, out: out.join("\n"), errors: errors.join("\n") }));
}

test("selects the files the mutation configuration mutates, and only those", async () => {
  await withRepository(async (dir) => {
    assert.deepEqual(filesToMutate({ root: dir, patterns: strykerConfig.mutate }), [
      ...RULE_PACKAGE_FILES,
    ]);
  });
});

test("puts every file in exactly one shard, whatever the number of shards", () => {
  for (let total = 1; total <= RULE_PACKAGE_FILES.length; total += 1) {
    const shards = Array.from({ length: total }, (_, index) =>
      shardOfFiles(RULE_PACKAGE_FILES, { index, total }),
    );

    assert.deepEqual(shards.flat().sort(), [...RULE_PACKAGE_FILES].sort(), `${total} shards`);
  }
});

test("gives the shards sizes that differ by one file at most", () => {
  const sizes = [0, 1, 2].map(
    (index) => shardOfFiles(RULE_PACKAGE_FILES, { index, total: 3 }).length,
  );

  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, String(sizes));
});

test("refuses more shards than files, which would leave a shard testing nothing", () => {
  assert.throws(() => shardOfFiles(RULE_PACKAGE_FILES, { index: 0, total: 6 }), /6 shards/);
});

test("prints the files of the shard it runs in as the list stryker's --mutate takes", async () => {
  await withRepository(async (dir) => {
    const shards = [];
    for (const index of ["0", "1"]) {
      const run = await runInShard(dir, { MUTATION_SHARD_INDEX: index, MUTATION_SHARD_TOTAL: "2" });
      assert.equal(run.status, 0, run.errors);
      shards.push(run.out.split(","));
    }

    assert.deepEqual(shards.flat().sort(), [...RULE_PACKAGE_FILES].sort());
  });
});

test("fails without the shard it runs in", async () => {
  await withRepository(async (dir) => {
    const run = await runInShard(dir, {});

    assert.equal(run.status, 1);
    assert.equal(run.out, "");
    assert.match(run.errors, /MUTATION_SHARD_INDEX/);
  });
});

test("fails for a shard outside the number of shards", async () => {
  await withRepository(async (dir) => {
    for (const [index, total] of [
      ["2", "2"],
      ["-1", "2"],
      ["0.5", "2"],
      ["0", "0"],
      ["a", "2"],
    ]) {
      const run = await runInShard(dir, {
        MUTATION_SHARD_INDEX: index,
        MUTATION_SHARD_TOTAL: total,
      });

      assert.equal(run.status, 1, `${index}/${total}`);
      assert.equal(run.out, "", `${index}/${total}`);
    }
  });
});

test("fails for more shards than files to mutate", async () => {
  await withRepository(async (dir) => {
    const run = await runInShard(dir, { MUTATION_SHARD_INDEX: "0", MUTATION_SHARD_TOTAL: "6" });

    assert.equal(run.status, 1);
    assert.equal(run.out, "");
    assert.match(run.errors, /^mutation-shard: 6 shards for 5 files/);
  });
});
