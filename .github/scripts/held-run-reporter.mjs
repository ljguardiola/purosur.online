import { relative } from "node:path";

const NAMED_FILES = 10;

function fileKey(projectName, moduleId) {
  return `${projectName}\0${moduleId}`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Vitest can keep a run open after every one of its files reported, without saying what it waits
// for. This names what is still open and, once every file reported, ends the run with the result
// those files gave; a file that never reported never ends the run.
export class HeldRunReporter {
  #graceMs;
  #stallMs;
  #finishWith;
  #log;
  #exit;
  #vitest;
  #remaining = new Map();
  #finished = [];
  #progressed = new Set();
  #stalled = new Set();
  #stallTimer;
  #graceTimer;

  constructor({
    graceMs,
    stallMs,
    finishWith = [],
    log = (line) => console.error(line),
    exit = (code) => process.exit(code),
  }) {
    this.#graceMs = graceMs;
    this.#stallMs = stallMs;
    this.#finishWith = finishWith;
    this.#log = log;
    this.#exit = exit;
  }

  onInit(vitest) {
    this.#vitest = vitest;
  }

  onTestRunStart(specifications) {
    this.#stop();
    if (this.#vitest.config.watch) return;
    this.#remaining = new Map(
      specifications.map((spec) => [
        fileKey(spec.project.name, spec.moduleId),
        { project: spec.project.name, moduleId: spec.moduleId },
      ]),
    );
    this.#finished = [];
    this.#progressed.clear();
    this.#stalled.clear();
    this.#stallTimer = setInterval(() => this.#reportStalledProjects(), this.#stallMs);
    this.#stallTimer.unref?.();
  }

  onTestModuleEnd(testModule) {
    if (!this.#stallTimer) return;
    const project = testModule.project.name;
    this.#remaining.delete(fileKey(project, testModule.moduleId));
    this.#finished.push(testModule);
    this.#progressed.add(project);
    this.#stalled.delete(project);
    if (this.#remaining.size === 0 && !this.#graceTimer) {
      this.#graceTimer = setTimeout(() => this.#endHeldRun(), this.#graceMs);
      this.#graceTimer.unref?.();
    }
  }

  onTestRunEnd() {
    this.#stop();
  }

  #stop() {
    clearInterval(this.#stallTimer);
    clearTimeout(this.#graceTimer);
    this.#stallTimer = undefined;
    this.#graceTimer = undefined;
  }

  #reportStalledProjects() {
    const remainingByProject = new Map();
    for (const file of this.#remaining.values()) {
      remainingByProject.set(file.project, [
        ...(remainingByProject.get(file.project) ?? []),
        file.moduleId,
      ]);
    }
    for (const [project, moduleIds] of remainingByProject) {
      if (this.#progressed.has(project) || this.#stalled.has(project)) continue;
      this.#stalled.add(project);
      this.#log(
        `held-run: no "${project}" test file finished in the last ${this.#stallMs / 1000}s; ` +
          `${moduleIds.length} still to report: ${this.#namedFiles(moduleIds)}` +
          this.#openPages([project], "has")
            .map((line) => `; ${line}`)
            .join(""),
      );
    }
    this.#progressed.clear();
  }

  #namedFiles(moduleIds) {
    const named = moduleIds
      .slice(0, NAMED_FILES)
      .map((moduleId) => relative(this.#vitest.config.root, moduleId))
      .join(", ");
    const rest = moduleIds.length - NAMED_FILES;
    return rest > 0 ? `${named} and ${rest} more` : named;
  }

  #openPages(projectNames, verb) {
    return this.#vitest.projects
      .filter((project) => projectNames.includes(project.name))
      .map((project) => ({ name: project.name, sessions: project.browser?.state.orchestrators }))
      .filter(({ sessions }) => sessions && sessions.size > 0)
      .map(
        ({ name, sessions }) =>
          `"${name}" ${verb} ${plural(sessions.size, "browser page")} open: ${[...sessions.keys()].join(", ")}`,
      );
  }

  async #endHeldRun() {
    this.#stop();
    const openPages = this.#openPages(
      this.#vitest.projects.map((project) => project.name),
      "still has",
    );
    this.#log(
      `held-run: every test file reported ${this.#graceMs / 1000}s ago and Vitest has not ended. ` +
        (openPages.length > 0 ? openPages.join("; ") : "no browser page is open"),
    );
    const errors = this.#vitest.state.getUnhandledErrors();
    const failed = this.#finished.filter((testModule) => testModule.state() === "failed").length;
    const state = failed > 0 || errors.length > 0 ? "failed" : "passed";
    await Promise.all(
      this.#finishWith.map((reporter) => reporter.onTestRunEnd?.(this.#finished, errors, state)),
    );
    this.#log(
      `held-run: ending with the tests' own result: ${state} ` +
        `(${this.#finished.length} files, ${failed} failed)`,
    );
    this.#exit(state === "passed" ? 0 : 1);
  }
}
