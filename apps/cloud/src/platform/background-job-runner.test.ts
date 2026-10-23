import { EventEmitter } from "node:events";
import type { RunnerOptions } from "graphile-worker";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startBackgroundJobRunner } from "./background-job-runner.js";

const otherTask = vi.fn();
const otherJob = { taskList: { "other-task": otherTask }, crontab: ["0 * * * * other-task"] };

function fakeRunner() {
  return { stop: vi.fn().mockResolvedValue(undefined), promise: new Promise<void>(() => {}) };
}

class FakePool extends EventEmitter {
  readonly end = vi.fn().mockResolvedValue(undefined);
}

function deferred(): { promise: Promise<void>; settle: () => void } {
  let settle: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function deferredFailure(): { promise: Promise<void>; fail: (error: Error) => void } {
  let fail: (error: Error) => void = () => {};
  const promise = new Promise<void>((_resolve, reject) => {
    fail = reject;
  });
  return { promise, fail };
}

function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mustExist<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`test setup: expected ${description}`);
  }
  return value;
}

describe("startBackgroundJobRunner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts graphile-worker against its own pool for the given connection string, with the tasks of the jobs it is given", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);

    await startBackgroundJobRunner(
      { databaseUrl: "postgres://user:pass@db/purosur", jobs: [otherJob] },
      { runWorker, createPool },
    );

    expect(createPool).toHaveBeenCalledWith("postgres://user:pass@db/purosur");
    expect(runWorker).toHaveBeenCalledTimes(1);
    const [options] = runWorker.mock.calls[0] as [{ pgPool: Pool; taskList: object }];
    expect(options.pgPool).toBe(pool);
    expect(options.taskList).toEqual({ "other-task": otherTask });
  });

  it("installs a permanent error handler on the pool it owns, so a disconnected idle client never becomes an unhandled error", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool },
    );

    const error = new Error("idle client disconnected");
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    expect(() => pool.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "background job runner: idle database client failed",
      error,
    );
  });

  it("installs a connect handler on the pool it owns, so graphile-worker's own assertPool never installs (and later removes) its own", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool },
    );

    expect(pool.listenerCount("connect")).toBeGreaterThan(0);
    const client = new EventEmitter();
    pool.emit("connect", client);
    pool.emit("acquire", client);
    const error = new Error("connection terminated unexpectedly");

    expect(client.listenerCount("error")).toBeGreaterThan(0);
    expect(() => client.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "background job runner: active database client failed",
      error,
    );
  });

  it("registers and schedules the jobs it is given, every job's crontab lines in order", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const firstTask = vi.fn();
    const secondTask = vi.fn();

    await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [
          { taskList: { "first-task": firstTask }, crontab: ["*/5 * * * * first-task"] },
          { taskList: { "second-task": secondTask }, crontab: ["0 * * * * second-task"] },
        ],
      },
      { runWorker },
    );

    const [options] = runWorker.mock.calls[0] as [
      { taskList: Record<string, unknown>; crontab?: string },
    ];
    expect(options.taskList["first-task"]).toBe(firstTask);
    expect(options.taskList["second-task"]).toBe(secondTask);
    expect(options.crontab?.split("\n")).toEqual([
      "*/5 * * * * first-task",
      "0 * * * * second-task",
    ]);
  });

  it("registers every task but schedules none when its schedules are turned off", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());

    await startBackgroundJobRunner(
      { databaseUrl: "postgres://user:pass@db/purosur", jobs: [otherJob], schedules: false },
      { runWorker },
    );

    const [options] = runWorker.mock.calls[0] as [RunnerOptions];
    expect(options.taskList?.["other-task"]).toBe(otherTask);
    expect(options.crontab).toBeUndefined();
    expect(options.parsedCronItems).toEqual([]);
  });

  it("delegates stop() to the runner returned by graphile-worker, then awaits closing the pool it owns", async () => {
    const events: string[] = [];
    const drain = deferred();
    const runner = {
      stop: vi.fn().mockImplementation(async () => {
        events.push("runner stopped");
      }),
      promise: drain.promise,
    };
    const runWorker = vi.fn().mockResolvedValue(runner);
    const pool = new FakePool();
    pool.end.mockImplementation(async () => {
      events.push("pool ended");
    });
    const createPool = vi.fn().mockReturnValue(pool);

    const handle = await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool },
    );
    const stopping = handle.stop();
    await flushPendingWork();

    expect(runner.stop).toHaveBeenCalledTimes(1);
    expect(pool.end).not.toHaveBeenCalled();

    drain.settle();
    await stopping;

    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["runner stopped", "pool ended"]);
  });

  it("never asks an already self-stopped runner to stop again, and ends the pool only once its own drain has finished", async () => {
    let capturedEvents: EventEmitter | undefined;
    const drain = deferred();
    const runner = {
      stop: vi.fn().mockRejectedValue(new Error("Runner is already stopped")),
      promise: drain.promise,
    };
    const runWorker = vi.fn().mockImplementation(async (options) => {
      capturedEvents = (options as { events?: EventEmitter }).events;
      return runner;
    });
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);

    const handle = await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool },
    );

    mustExist(capturedEvents, "the events emitter passed to graphile-worker's run()").emit("stop", {
      ctx: {},
    });

    const stopping = handle.stop();
    await flushPendingWork();

    expect(pool.end).not.toHaveBeenCalled();

    drain.settle();
    await stopping;

    expect(runner.stop).not.toHaveBeenCalled();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("still ends the pool when actually stopping the runner fails, and rejects with that failure", async () => {
    const runner = {
      stop: vi.fn().mockRejectedValue(new Error("stop failed: connection reset")),
      promise: Promise.resolve(),
    };
    const runWorker = vi.fn().mockResolvedValue(runner);
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);

    const handle = await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool },
    );

    await expect(handle.stop()).rejects.toThrow("stop failed: connection reset");
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("still waits for the runner's drain before ending the pool when stopping the runner fails", async () => {
    const drain = deferred();
    const runner = {
      stop: vi.fn().mockRejectedValue(new Error("stop failed: connection reset")),
      promise: drain.promise,
    };
    const runWorker = vi.fn().mockResolvedValue(runner);
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);

    const handle = await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool },
    );
    const stopping = handle.stop().then(
      () => undefined,
      (error: unknown) => error,
    );
    await flushPendingWork();

    expect(pool.end).not.toHaveBeenCalled();

    drain.settle();
    const failure = await stopping;

    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("stop failed: connection reset");
  });

  it("reports both failures when stopping the runner fails and ending the pool fails too", async () => {
    const runner = {
      stop: vi.fn().mockRejectedValue(new Error("stop failed: connection reset")),
      promise: Promise.resolve(),
    };
    const runWorker = vi.fn().mockResolvedValue(runner);
    const pool = new FakePool();
    pool.end.mockRejectedValue(new Error("pool end failed: socket closed"));
    const createPool = vi.fn().mockReturnValue(pool);

    const handle = await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool },
    );
    const failure = await handle.stop().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual([
      expect.stringContaining(
        "background job runner failed to shut down: stop failed: connection reset",
      ),
      expect.stringContaining(
        "background job runner pool failed to shut down: pool end failed: socket closed",
      ),
    ]);
  });

  it("reports the runner exiting on its own with an error, so its rejection never goes unhandled", async () => {
    const exit = deferredFailure();
    const runner = { stop: vi.fn().mockResolvedValue(undefined), promise: exit.promise };
    const runWorker = vi.fn().mockResolvedValue(runner);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unhandled: unknown[] = [];
    const recordUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", recordUnhandled);

    try {
      await startBackgroundJobRunner(
        {
          databaseUrl: "postgres://user:pass@db/purosur",
          jobs: [otherJob],
        },
        { runWorker, createPool: vi.fn().mockReturnValue(new FakePool()) },
      );
      const error = new Error("Could not failJobs; queue is in an inconsistent state; aborting.");
      exit.fail(error);
      await flushPendingWork();

      expect(consoleError).toHaveBeenCalledWith(
        "background job runner: runner exited with an error",
        error,
      );
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", recordUnhandled);
    }
  });

  it("reports to error tracking an error graphile-worker logs with a fatal error, such as a job outcome it could not record", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool: vi.fn().mockReturnValue(new FakePool()), captureException },
    );
    const [options] = runWorker.mock.calls[0] as [RunnerOptions];
    const logger = mustExist(options.logger, "the logger passed to graphile-worker's run()");
    const error = new Error("Connection terminated unexpectedly");
    logger
      .scope({ label: "worker" })
      .error("Failed to record the failure of job '1' (other-task)", { fatalError: error });

    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "background job runner: Failed to record the failure of job '1' (other-task)",
      error,
    );
  });

  it("keeps a job failure graphile-worker logs without a fatal error on the console only", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker, createPool: vi.fn().mockReturnValue(new FakePool()), captureException },
    );
    const [options] = runWorker.mock.calls[0] as [RunnerOptions];
    const logger = mustExist(options.logger, "the logger passed to graphile-worker's run()");
    logger.error("Failed task 1 (other-task) with error malformed job payload", {
      error: new Error("malformed job payload"),
    });

    expect(captureException).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.map(String).join(" ")).toContain(
      "Failed task 1 (other-task) with error malformed job payload",
    );
  });

  it("runs more than one job at a time, so one slow job never holds up every other one", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());

    await startBackgroundJobRunner(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        jobs: [otherJob],
      },
      { runWorker },
    );

    const [options] = runWorker.mock.calls[0] as [{ concurrency?: number }];
    expect(options.concurrency).toBeGreaterThan(1);
  });
});
