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

class OrderPreservingSequencer {
  async shard(files) {
    return files;
  }

  async sort(files) {
    return files;
  }
}

async function firstRun(reporter, project, { queued, executed = queued }) {
  const Sequencer = reporter.trackRunFiles(OrderPreservingSequencer);
  reporter.onTestRunStart?.(queued);
  await new Sequencer().sort(executed);
  await reporter.onBrowserInit(project);
  return Sequencer;
}

async function watchRerun(reporter, Sequencer, files) {
  reporter.onTestRunStart?.(files);
  await new Sequencer().sort(files);
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

    await firstRun(reporter, project, {
      queued: [
        specification(project, "apps/pos/src/renderer/installation/enrollment-screen.test.tsx"),
        specification(project, "apps/backoffice/src/catalog/brands-list-screen.test.tsx"),
      ],
    });

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

    await firstRun(reporter, project, {
      queued: [
        specification(project, "apps/pos/src/renderer/installation/enrollment-screen.test.tsx"),
      ],
    });

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

    await firstRun(reporter, project, {
      queued: [
        specification(nodeProject, "apps/backoffice/src/catalog/brands-api.test.ts"),
        specification(project, "apps/pos/src/renderer/installation/enrollment-screen.test.tsx"),
      ],
    });

    assert.deepEqual(warmed, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a shard with no file of the watched folder warms up nothing though the whole run has one", async () => {
  const root = repositoryWith(REPOSITORY_FILES);
  try {
    const { project, warmed } = fakeBrowserProject(root);
    const reporter = backofficePagesReporter();
    const posFile = specification(
      project,
      "apps/pos/src/renderer/installation/enrollment-screen.test.tsx",
    );

    await firstRun(reporter, project, {
      queued: [
        posFile,
        specification(project, "apps/backoffice/src/catalog/brands-list-screen.test.tsx"),
      ],
      executed: [posFile],
    });

    assert.deepEqual(warmed, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a watch rerun that first includes a file of the watched folder warms up every client file", async () => {
  const root = repositoryWith(REPOSITORY_FILES);
  try {
    const { project, warmed } = fakeBrowserProject(root);
    const reporter = backofficePagesReporter();

    const Sequencer = await firstRun(reporter, project, {
      queued: [
        specification(project, "apps/pos/src/renderer/installation/enrollment-screen.test.tsx"),
      ],
    });
    await watchRerun(reporter, Sequencer, [
      specification(project, "apps/backoffice/src/catalog/brands-list-screen.test.tsx"),
    ]);

    assert.deepEqual(warmed.sort(), [
      "/apps/backoffice/src/catalog/brands-list-page.tsx",
      "/apps/backoffice/src/users/users-list-page.tsx",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watch reruns that include a file of the watched folder again warm up each client file once", async () => {
  const root = repositoryWith(REPOSITORY_FILES);
  try {
    const { project, warmed } = fakeBrowserProject(root);
    const reporter = backofficePagesReporter();
    const backofficeFile = specification(
      project,
      "apps/backoffice/src/catalog/brands-list-screen.test.tsx",
    );

    const Sequencer = await firstRun(reporter, project, { queued: [backofficeFile] });
    await watchRerun(reporter, Sequencer, [backofficeFile]);

    assert.deepEqual(warmed.sort(), [
      "/apps/backoffice/src/catalog/brands-list-page.tsx",
      "/apps/backoffice/src/users/users-list-page.tsx",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
