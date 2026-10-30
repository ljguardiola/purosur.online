import { relative } from "node:path";

function fileKey(projectName, moduleId) {
  return `${projectName}\0${moduleId}`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Vitest can keep a run open after every one of its files reported, without saying what it waits
// for, and a file can hang without ever reporting. This names what is still open and ends the run:
// once every file reported, with the result those files gave; once a project with a running file,
// or the whole run, makes no progress within the stall period, with a failure. A file is running
// from the moment a worker starts it, so files waiting for a free worker never stall a project.
export class HeldRunReporter {
  #graceMs;
  #stallMs;
  #log;
  #exit;
  #vitest;
  #remaining = new Map();
  #running = new Set();
  #finished = [];
  #watching = false;
  #projectStallTimers = new Map();
  #runStallTimer;
  #graceTimer;

  constructor({
    graceMs,
    stallMs,
    log = (line) => console.error(line),
    exit = (code) => process.exit(code),
  }) {
    this.#graceMs = graceMs;
    this.#stallMs = stallMs;
    this.#log = log;
    this.#exit = exit;
  }

  trackExecutedFiles(Sequencer) {
    const guard = this;
    return class extends Sequencer {
      async sort(files) {
        guard.#watch(files);
        return super.sort(files);
      }
    };
  }

  onInit(vitest) {
    this.#vitest = vitest;
  }

  onTestRunStart() {
    this.#stop();
  }

  #watch(specifications) {
    this.#stop();
    if (this.#vitest.config.watch) return;
    this.#remaining = new Map(
      specifications.map((spec) => [
        fileKey(spec.project.name, spec.moduleId),
        { project: spec.project.name, moduleId: spec.moduleId },
      ]),
    );
    this.#running.clear();
    this.#finished = [];
    this.#watching = true;
    this.#armRunStallTimer();
  }

  onTestModuleQueued(testModule) {
    if (!this.#watching) return;
    const key = fileKey(testModule.project.name, testModule.moduleId);
    if (!this.#remaining.has(key)) return;
    this.#running.add(key);
    this.#progressed(testModule.project.name);
  }

  onTestCaseResult(testCase) {
    if (!this.#watching) return;
    this.#progressed(testCase.project.name);
  }

  onTestModuleEnd(testModule) {
    if (!this.#watching) return;
    const project = testModule.project.name;
    const key = fileKey(project, testModule.moduleId);
    this.#remaining.delete(key);
    this.#running.delete(key);
    this.#finished.push(testModule);
    if (this.#remaining.size > 0) {
      this.#progressed(project);
      return;
    }
    this.#stopStallTimers();
    if (!this.#graceTimer) {
      this.#graceTimer = setTimeout(() => this.#endHeldRun(), this.#graceMs);
      this.#graceTimer.unref?.();
    }
  }

  onTestRunEnd() {
    this.#stop();
  }

  #progressed(project) {
    clearTimeout(this.#projectStallTimers.get(project));
    const timer = setTimeout(() => this.#checkProjectStall(project), this.#stallMs);
    timer.unref?.();
    this.#projectStallTimers.set(project, timer);
    this.#armRunStallTimer();
  }

  #armRunStallTimer() {
    clearTimeout(this.#runStallTimer);
    this.#runStallTimer = setTimeout(
      () =>
        this.#endStalledRun(
          `no test finished and no test file started in the last ${this.#stallMs / 1000}s`,
        ),
      this.#stallMs,
    );
    this.#runStallTimer.unref?.();
  }

  #checkProjectStall(project) {
    this.#projectStallTimers.delete(project);
    const running = [...this.#running].some((key) => this.#remaining.get(key)?.project === project);
    if (!running) return;
    this.#endStalledRun(
      `no "${project}" test finished in the last ${this.#stallMs / 1000}s while one of its files ran`,
    );
  }

  #stopStallTimers() {
    for (const timer of this.#projectStallTimers.values()) clearTimeout(timer);
    this.#projectStallTimers.clear();
    clearTimeout(this.#runStallTimer);
    this.#runStallTimer = undefined;
  }

  #stop() {
    this.#stopStallTimers();
    clearTimeout(this.#graceTimer);
    this.#graceTimer = undefined;
    this.#watching = false;
  }

  async #endStalledRun(reason) {
    const remaining = [...this.#remaining.values()];
    this.#stop();
    this.#log(`held-run: ${reason}`);
    const remainingByProject = new Map();
    for (const file of remaining) {
      remainingByProject.set(file.project, [
        ...(remainingByProject.get(file.project) ?? []),
        file.moduleId,
      ]);
    }
    for (const [project, moduleIds] of remainingByProject) {
      this.#log(
        `held-run: ${plural(moduleIds.length, `"${project}" file`)} still to report: ` +
          moduleIds.map((moduleId) => relative(this.#vitest.config.root, moduleId)).join(", ") +
          this.#openPages([project], "has")
            .map((line) => `; ${line}`)
            .join(""),
      );
    }
    await this.#reportRunEnd("failed");
    this.#log(
      `held-run: ending with a failure (${this.#finished.length} files reported, ` +
        `${remaining.length} still to report)`,
    );
    this.#exit(1);
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

  async #reportRunEnd(state) {
    const errors = this.#vitest.state.getUnhandledErrors();
    await Promise.all(
      this.#vitest.reporters
        .filter((reporter) => reporter !== this)
        .map((reporter) => reporter.onTestRunEnd?.(this.#finished, errors, state)),
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
    await this.#reportRunEnd(state);
    this.#log(
      `held-run: ending with the tests' own result: ${state} ` +
        `(${this.#finished.length} files, ${failed} failed` +
        (errors.length > 0 ? `, ${plural(errors.length, "unhandled error")})` : ")"),
    );
    this.#exit(state === "passed" ? 0 : 1);
  }
}
