import { relative } from "node:path";

const NEVER_RAN = new Set(["pending", "queued"]);

// When a browser page fails to connect, Vitest drops every file its project still had queued
// without reporting them as failed or skipped, so a run can end with all its tests passing
// although whole files never ran.
export class UnrunFilesReporter {
  #log;
  #fail;
  #root = "";

  constructor({
    log = (line) => console.error(line),
    fail = () => {
      process.exitCode = 1;
    },
  } = {}) {
    this.#log = log;
    this.#fail = fail;
  }

  onInit(vitest) {
    this.#root = vitest.config.root;
  }

  onTestRunEnd(testModules, _unhandledErrors, reason) {
    if (reason === "interrupted") return;
    const unrun = testModules.filter((testModule) => NEVER_RAN.has(testModule.state()));
    if (unrun.length === 0) return;
    this.#log(`Test files that never ran (${unrun.length})`);
    for (const testModule of unrun) {
      this.#log(`  ${testModule.project.name}  ${relative(this.#root, testModule.moduleId)}`);
    }
    this.#fail();
  }
}
