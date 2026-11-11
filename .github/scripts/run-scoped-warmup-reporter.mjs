import { glob } from "node:fs/promises";
import { relative, sep } from "node:path";

// Vite's own `server.warmup` transforms its files whenever the server starts, so every run of a
// project pays for them, even one that never imports them. This starts the same warmup once a
// project's browser server listens and a run of that project includes a test file of the given
// folder, whichever comes last. A run's files are read from the sequencer because Vitest reports
// them to reporters before `--shard` narrows them, and hands the sequencer each watch rerun's own.
export class RunScopedWarmupReporter {
  #whenRunIncludes;
  #clientFiles;
  #projectsRunningTheFolder = new Set();
  #listeningProjects = new Set();
  #warmedProjects = new Set();

  constructor({ whenRunIncludes, clientFiles }) {
    this.#whenRunIncludes = whenRunIncludes;
    this.#clientFiles = clientFiles;
  }

  trackRunFiles(Sequencer) {
    const warmup = this;
    return class extends Sequencer {
      async sort(files) {
        await warmup.#runIncludes(files);
        return super.sort(files);
      }
    };
  }

  async onBrowserInit(project) {
    this.#listeningProjects.add(project);
    await this.#warmUpWhenReady(project);
  }

  async #runIncludes(specifications) {
    for (const { project, moduleId } of specifications) {
      const file = relative(project.config.root, moduleId).split(sep).join("/");
      if (file.startsWith(this.#whenRunIncludes)) this.#projectsRunningTheFolder.add(project);
    }
    for (const project of this.#projectsRunningTheFolder) await this.#warmUpWhenReady(project);
  }

  async #warmUpWhenReady(project) {
    if (!this.#listeningProjects.has(project) || !this.#projectsRunningTheFolder.has(project)) {
      return;
    }
    if (this.#warmedProjects.has(project)) return;
    const client = project.browser?.vite.environments.client;
    if (!client) return;
    this.#warmedProjects.add(project);
    for await (const file of glob(this.#clientFiles, { cwd: project.config.root })) {
      client.warmupRequest(`/${file.split(sep).join("/")}`);
    }
  }
}
