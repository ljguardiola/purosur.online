import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { after, before, describe, test } from "node:test";
import { createVitest } from "vitest/node";
import {
  describeUnresolvedSubpath,
  findWorkspaceSubpathImports,
} from "./workspace-subpaths-resolve-to-source.mjs";

const root = realpathSync(process.cwd());

const setups = [
  { config: "vitest.config.ts", project: "node", environments: ["ssr", "client"] },
  { config: "vitest.config.ts", project: "browser", environments: ["client"] },
  { config: "vitest.mutation.config.ts", environments: ["ssr"] },
];

for (const { config, project, environments } of setups) {
  describe(`${config}${project ? `, project ${project}` : ""}`, () => {
    let vitest;

    before(async () => {
      vitest = await createVitest("test", {
        config: join(root, config),
        watch: false,
        ...(project && { project }),
      });
    });

    after(() => vitest.close());

    const environment = (name) => vitest.projects[0].vite.environments[name];

    for (const name of environments) {
      test(`the ${name} environment resolves every workspace subpath to its package's source`, async () => {
        const unresolved = [];
        for (const {
          specifier,
          consumer,
          consumerDirectory,
          dependencyDirectory,
        } of findWorkspaceSubpathImports(root)) {
          const importer = join(root, consumerDirectory, "src", "index.ts");
          const resolved = await environment(name).pluginContainer.resolveId(specifier, importer);
          if (!resolved?.id.startsWith(join(root, dependencyDirectory, "src/"))) {
            unresolved.push({
              specifier,
              consumer,
              resolvedPath: resolved ? relative(root, resolved.id) : undefined,
            });
          }
        }

        assert.deepEqual(unresolved.map(describeUnresolvedSubpath), []);
      });

      test(`the ${name} environment refuses to load a workspace package's compiled output`, async () => {
        await assert.rejects(
          environment(name).pluginContainer.load(join(root, "packages/domain/dist/index.js")),
          /packages\/domain\/dist\/index\.js is a workspace package's compiled output/,
        );
      });
    }
  });
}
