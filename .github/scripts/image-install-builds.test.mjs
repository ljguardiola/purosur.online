import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  buildsRunByFilteredInstall,
  filteredInstallsIn,
  packagesReachedByFilteredInstall,
} from "./image-install-builds.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const projects = {
  "apps/cloud": "@purosur/cloud",
  "apps/pos": "@purosur/pos",
  "packages/domain": "@purosur/domain",
};

function lockfileWith({ importers, snapshots = {} }) {
  return {
    importers: {
      "apps/cloud": {},
      "apps/pos": {},
      "packages/domain": {},
      ...importers,
    },
    snapshots,
  };
}

const orm = {
  "orm@1.0.0(native-driver@2.0.0)": {
    optionalDependencies: { "native-driver": "2.0.0" },
  },
  "native-driver@2.0.0": {},
};

test("reports an approved build reached through an optional peer of a project's dependency", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": {
        dependencies: { orm: { specifier: "^1", version: "1.0.0(native-driver@2.0.0)" } },
      },
    },
    snapshots: orm,
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { "native-driver": true },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, ["native-driver"]);
});

test("lists every registry package a filtered install reaches, whether or not it builds", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": {
        dependencies: {
          "@purosur/domain": { specifier: "workspace:*", version: "link:../../packages/domain" },
          orm: { specifier: "^1", version: "1.0.0(native-driver@2.0.0)" },
        },
      },
      "packages/domain": { dependencies: { schema: { specifier: "^4", version: "4.0.0" } } },
      "apps/pos": { dependencies: { printer: { specifier: "^1", version: "1.0.0" } } },
    },
    snapshots: { ...orm, "schema@4.0.0": {}, "printer@1.0.0": {} },
  });

  const packages = packagesReachedByFilteredInstall({
    lockfile,
    projects,
    filter: "@purosur/cloud",
  });

  assert.deepEqual(packages, ["native-driver", "orm", "schema"]);
});

test("reports nothing when the installed graph holds no approved build", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": { dependencies: { orm: { specifier: "^1", version: "1.0.0" } } },
    },
    snapshots: { "orm@1.0.0": {} },
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { "native-driver": true },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, []);
});

test("ignores a package whose build is not approved, since the install never runs it", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": { devDependencies: { bundler: { specifier: "^3", version: "3.0.0" } } },
    },
    snapshots: { "bundler@3.0.0": {} },
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { bundler: false },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, []);
});

test("follows development dependencies, which the filtered install also installs", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": {
        devDependencies: { orm: { specifier: "^1", version: "1.0.0(native-driver@2.0.0)" } },
      },
    },
    snapshots: orm,
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { "native-driver": true },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, ["native-driver"]);
});

test("follows the workspace projects the filtered project depends on", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": {
        dependencies: {
          "@purosur/domain": { specifier: "workspace:*", version: "link:../../packages/domain" },
        },
      },
      "packages/domain": {
        dependencies: { "native-driver": { specifier: "^2", version: "2.0.0" } },
      },
    },
    snapshots: orm,
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { "native-driver": true },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, ["native-driver"]);
});

test("leaves out the projects the filter does not select", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": { dependencies: { orm: { specifier: "^1", version: "1.0.0" } } },
      "apps/pos": { dependencies: { "native-driver": { specifier: "^2", version: "2.0.0" } } },
    },
    snapshots: { "orm@1.0.0": {}, "native-driver@2.0.0": {} },
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { "native-driver": true },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, []);
});

test("reports each approved build once, however many paths reach it", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": {
        dependencies: {
          orm: { specifier: "^1", version: "1.0.0(native-driver@2.0.0)" },
          "native-driver": { specifier: "^2", version: "2.0.0" },
        },
      },
    },
    snapshots: orm,
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { "native-driver": true },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, ["native-driver"]);
});

test("follows an aliased dependency under the name of the package it installs", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": {
        dependencies: {
          "driver-alias": { specifier: "npm:native-driver@^2", version: "native-driver@2.0.0" },
        },
      },
    },
    snapshots: orm,
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { "native-driver": true },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, ["native-driver"]);
});

test("follows an aliased scoped dependency under the name of the package it installs", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": {
        dependencies: {
          "driver-alias": { specifier: "npm:@native/driver@^2", version: "@native/driver@2.0.0" },
        },
      },
    },
    snapshots: { "@native/driver@2.0.0": {} },
  });

  const builds = buildsRunByFilteredInstall({
    lockfile,
    projects,
    allowBuilds: { "@native/driver": true },
    filter: "@purosur/cloud",
  });

  assert.deepEqual(builds, ["@native/driver"]);
});

test("rejects a dependency the lockfile holds no snapshot for, instead of skipping what it would install", () => {
  const lockfile = lockfileWith({
    importers: {
      "apps/cloud": { dependencies: { orm: { specifier: "^1", version: "1.0.0" } } },
    },
  });

  assert.throws(
    () =>
      buildsRunByFilteredInstall({
        lockfile,
        projects,
        allowBuilds: {},
        filter: "@purosur/cloud",
      }),
    /orm@1\.0\.0/,
  );
});

test("rejects a filter that names no workspace project", () => {
  assert.throws(
    () =>
      buildsRunByFilteredInstall({
        lockfile: lockfileWith({ importers: {} }),
        projects,
        allowBuilds: {},
        filter: "@purosur/missing",
      }),
    /@purosur\/missing/,
  );
});

test("finds every filtered install in a Dockerfile", () => {
  const dockerfile = [
    "FROM base AS build",
    "RUN pnpm install --frozen-lockfile --filter @purosur/cloud...",
    "RUN pnpm --filter @purosur/cloud build",
    "FROM base AS build-backoffice",
    "RUN pnpm install --frozen-lockfile --filter @purosur/backoffice...",
  ].join("\n");

  assert.deepEqual(filteredInstallsIn(dockerfile), ["@purosur/cloud", "@purosur/backoffice"]);
});

test("rejects a pnpm install whose filter it cannot read, instead of leaving it unchecked", () => {
  const dockerfile = [
    "RUN pnpm install --frozen-lockfile --filter @purosur/cloud...",
    "RUN pnpm install --frozen-lockfile --filter=@purosur/backoffice...",
  ].join("\n");

  assert.throws(() => filteredInstallsIn(dockerfile), /--filter=@purosur\/backoffice/);
});

async function workspaceProjects(lockfile) {
  const entries = await Promise.all(
    Object.keys(lockfile.importers).map(async (path) => {
      const manifest = JSON.parse(await readFile(join(repoRoot, path, "package.json"), "utf8"));
      return [path, manifest.name];
    }),
  );
  return Object.fromEntries(entries);
}

test("the cloud image's installs run no build script, since its base image has no toolchain to compile one", async () => {
  const lockfile = parse(await readFile(join(repoRoot, "pnpm-lock.yaml"), "utf8"));
  const { allowBuilds } = parse(await readFile(join(repoRoot, "pnpm-workspace.yaml"), "utf8"));
  const filters = filteredInstallsIn(
    await readFile(join(repoRoot, "apps/cloud/Dockerfile"), "utf8"),
  );
  const projects = await workspaceProjects(lockfile);

  assert.notEqual(filters.length, 0, "apps/cloud/Dockerfile runs no filtered pnpm install");
  for (const filter of filters) {
    assert.deepEqual(
      buildsRunByFilteredInstall({ lockfile, projects, allowBuilds, filter }),
      [],
      `pnpm install --filter ${filter}... in apps/cloud/Dockerfile would build these packages`,
    );
  }
});

test("the cloud image's installs reach none of the packages the register ships beside its bundled code", async () => {
  const lockfile = parse(await readFile(join(repoRoot, "pnpm-lock.yaml"), "utf8"));
  const { dependencies } = JSON.parse(
    await readFile(join(repoRoot, "apps/pos/package.json"), "utf8"),
  );
  const filters = filteredInstallsIn(
    await readFile(join(repoRoot, "apps/cloud/Dockerfile"), "utf8"),
  );
  const projects = await workspaceProjects(lockfile);

  assert.notEqual(Object.keys(dependencies).length, 0, "apps/pos declares no dependencies");
  for (const filter of filters) {
    const reached = packagesReachedByFilteredInstall({ lockfile, projects, filter });
    assert.deepEqual(
      reached.filter((name) => Object.hasOwn(dependencies, name)),
      [],
      `pnpm install --filter ${filter}... in apps/cloud/Dockerfile would install these register packages`,
    );
  }
});
