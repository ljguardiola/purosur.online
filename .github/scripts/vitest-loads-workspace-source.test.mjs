import assert from "node:assert/strict";
import { join, relative } from "node:path";
import { after, before, test } from "node:test";
import { createVitest } from "vitest/node";
import {
  describeUnresolvedSubpath,
  findWorkspaceSubpathImports,
} from "./workspace-subpaths-resolve-to-source.mjs";

const root = process.cwd();

let vitest;

before(async () => {
  vitest = await createVitest("test", { watch: false, project: "node" });
});

after(() => vitest.close());

const environment = (name) => vitest.projects[0].vite.environments[name];

for (const name of ["ssr", "client"]) {
  test(`Vitest's ${name} environment resolves every workspace subpath to its package's source`, async () => {
    const unresolved = [];
    for (const {
      specifier,
      consumer,
      consumerDirectory,
      dependencyDirectory,
    } of findWorkspaceSubpathImports()) {
      const importer = join(root, consumerDirectory, "src", "index.ts");
      const resolved = await environment(name).pluginContainer.resolveId(specifier, importer);
      if (!resolved?.id.startsWith(join(root, dependencyDirectory, "src/"))) {
        unresolved.push({
          specifier,
          consumer,
          resolvedPath: resolved && relative(root, resolved.id),
        });
      }
    }

    assert.deepEqual(unresolved.map(describeUnresolvedSubpath), []);
  });
}

test("Vitest refuses to load a workspace package's compiled output", async () => {
  await assert.rejects(
    environment("ssr").pluginContainer.load(join(root, "packages/domain/dist/index.js")),
    /packages\/domain\/dist\/index\.js is a workspace package's compiled output/,
  );
});
