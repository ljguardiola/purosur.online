import { glob } from "node:fs/promises";
import { relative, sep } from "node:path";

// Vite's own `server.warmup` transforms its files whenever the server starts, so every run of a
// project pays for them, even one that never imports them. This starts the same warmup at the same
// moment, right after the browser server listens, only for a project whose run includes a test file
// of the given folder.
export class RunScopedWarmupReporter {
  #whenRunIncludes;
  #clientFiles;
  #projectsToWarm = new Set();

  constructor({ whenRunIncludes, clientFiles }) {
    this.#whenRunIncludes = whenRunIncludes;
    this.#clientFiles = clientFiles;
  }

  onTestRunStart(specifications) {
    for (const { project, moduleId } of specifications) {
      const file = relative(project.config.root, moduleId).split(sep).join("/");
      if (file.startsWith(this.#whenRunIncludes)) this.#projectsToWarm.add(project);
    }
  }

  async onBrowserInit(project) {
    if (!this.#projectsToWarm.has(project)) return;
    const client = project.browser?.vite.environments.client;
    if (!client) return;
    for await (const file of glob(this.#clientFiles, { cwd: project.config.root })) {
      client.warmupRequest(`/${file.split(sep).join("/")}`);
    }
  }
}
