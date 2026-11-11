import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { RunScopedWarmupReporter } from "./run-scoped-warmup-reporter.mjs";

function repositoryWith(files) {
  const root = mkdtempSync(join(tmpdir(), "run-scoped-warmup-"));
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "");
  }
  return root;
}

function fakeBrowserProject(root, name = "browser") {
  const warmed = [];
  const project = {
    name,
    config: { root },
    browser: {
      vite: { environments: { client: { warmupRequest: async (url) => warmed.push(url) } } },
    },
  };
  return { project, warmed };
}

function specification(project, file) {
  return { project, moduleId: join(project.config.root, file) };
}

function backofficePagesReporter() {
  return new RunScopedWarmupReporter({
    whenRunIncludes: "apps/backoffice/",
    clientFiles: ["apps/backoffice/src/**/*-page.tsx"],
  });
}

const REPOSITORY_FILES = [
  "apps/backoffice/src/catalog/brands-list-page.tsx",
  "apps/backoffice/src/catalog/brands-list-screen.tsx",
  "apps/backoffice/src/users/users-list-page.tsx",
  "apps/pos/src/renderer/installation/enrollment-screen.tsx",
];

test("a browser run that includes a file of the watched folder warms up every client file", async () => {
  const root = repositoryWith(REPOSITORY_FILES);
  try {
    const { project, warmed } = fakeBrowserProject(root);
    const reporter = backofficePagesReporter();

    reporter.onTestRunStart([
      specification(project, "apps/pos/src/renderer/installation/enrollment-screen.test.tsx"),
      specification(project, "apps/backoffice/src/catalog/brands-list-screen.test.tsx"),
    ]);
    await reporter.onBrowserInit(project);

    assert.deepEqual(warmed.sort(), [
      "/apps/backoffice/src/catalog/brands-list-page.tsx",
      "/apps/backoffice/src/users/users-list-page.tsx",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a browser run with no file of the watched folder warms up nothing", async () => {
  const root = repositoryWith(REPOSITORY_FILES);
  try {
    const { project, warmed } = fakeBrowserProject(root);
    const reporter = backofficePagesReporter();

    reporter.onTestRunStart([
      specification(project, "apps/pos/src/renderer/installation/enrollment-screen.test.tsx"),
    ]);
    await reporter.onBrowserInit(project);

    assert.deepEqual(warmed, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file of the watched folder run by another project warms up nothing in this one", async () => {
  const root = repositoryWith(REPOSITORY_FILES);
  try {
    const { project, warmed } = fakeBrowserProject(root);
    const { project: nodeProject } = fakeBrowserProject(root, "node");
    const reporter = backofficePagesReporter();

    reporter.onTestRunStart([
      specification(nodeProject, "apps/backoffice/src/catalog/brands-api.test.ts"),
      specification(project, "apps/pos/src/renderer/installation/enrollment-screen.test.tsx"),
    ]);
    await reporter.onBrowserInit(project);

    assert.deepEqual(warmed, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
