import { EventEmitter } from "node:events";
import type { RunnerOptions } from "graphile-worker";
import type { Pool } from "pg";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { auditLog, users } from "../platform/db/schema.js";
import { buildTestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { processRecoveryRequestJob } from "./process-recovery-request-job.js";
import type { AccessEmailSender } from "./recovery-email-sender.js";
import {
  FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER,
  RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER,
  RECOVERY_REQUEST_TASK_IDENTIFIER,
  type StartRecoveryWorkerOptions,
  startRecoveryWorker,
} from "./recovery-worker.js";

const emailSender: AccessEmailSender = { sendRecoveryLink: vi.fn(), sendFirstPinCode: vi.fn() };

function fakeRunner() {
  return { stop: vi.fn().mockResolvedValue(undefined), promise: new Promise<void>(() => {}) };
}

const FIXED_NOW = new Date("2026-01-05T12:00:00.000Z");

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

describe("startRecoveryWorker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts graphile-worker against its own pool for the given connection string, with the recovery-request task", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, createPool },
    );

    expect(createPool).toHaveBeenCalledWith("postgres://user:pass@db/purosur");
    expect(runWorker).toHaveBeenCalledTimes(1);
    const [options] = runWorker.mock.calls[0] as [{ pgPool: Pool; taskList: object }];
    expect(options.pgPool).toBe(pool);
    expect(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER as keyof typeof options.taskList],
    ).toBeInstanceOf(Function);
  });

  it("installs a permanent error handler on the pool it owns, so a disconnected idle client never becomes an unhandled error", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, createPool },
    );

    const error = new Error("idle client disconnected");
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    expect(() => pool.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "recovery worker: idle database client failed",
      error,
    );
  });

  it("installs a connect handler on the pool it owns, so graphile-worker's own assertPool never installs (and later removes) its own", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
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
      "recovery worker: active database client failed",
      error,
    );
  });

  it("registers the rejected-attempt flush task and schedules it every 5 minutes", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker },
    );

    const [options] = runWorker.mock.calls[0] as [{ taskList: object; crontab?: string }];
    expect(
      options.taskList[
        RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER as keyof typeof options.taskList
      ],
    ).toBeInstanceOf(Function);
    expect(options.crontab).toContain("*/5 * * * * recovery-rejected-attempt-flush");
  });

  it("registers and schedules the jobs of other concepts it is given beside its own", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const otherTask = vi.fn();

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
        jobs: [{ taskList: { "other-task": otherTask }, crontab: ["0 * * * * other-task"] }],
      },
      { runWorker },
    );

    const [options] = runWorker.mock.calls[0] as [
      { taskList: Record<string, unknown>; crontab?: string },
    ];
    expect(options.taskList["other-task"]).toBe(otherTask);
    expect(options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(options.crontab?.split("\n")).toEqual([
      "*/5 * * * * recovery-rejected-attempt-flush",
      "0 * * * * other-task",
    ]);
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

    const handle = await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
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

    const handle = await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
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

    const handle = await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
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

    const handle = await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
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

    const handle = await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, createPool },
    );
    const failure = await handle.stop().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual([
      expect.stringContaining("stop failed: connection reset"),
      expect.stringContaining("pool end failed: socket closed"),
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
      await startRecoveryWorker(
        {
          databaseUrl: "postgres://user:pass@db/purosur",
          now: () => FIXED_NOW,
          backofficeOrigin: "https://staging.purosur.online",
          emailSender,
        },
        { runWorker, createPool: vi.fn().mockReturnValue(new FakePool()) },
      );
      const error = new Error("Could not failJobs; queue is in an inconsistent state; aborting.");
      exit.fail(error);
      await flushPendingWork();

      expect(consoleError).toHaveBeenCalledWith(
        "recovery worker: runner exited with an error",
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

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, createPool: vi.fn().mockReturnValue(new FakePool()), captureException },
    );
    const [options] = runWorker.mock.calls[0] as [RunnerOptions];
    const logger = mustExist(options.logger, "the logger passed to graphile-worker's run()");
    const error = new Error("Connection terminated unexpectedly");
    logger
      .scope({ label: "worker" })
      .error("Failed to record the failure of job '1' (recovery-request)", { fatalError: error });

    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "recovery worker: Failed to record the failure of job '1' (recovery-request)",
      error,
    );
  });

  it("keeps a job failure graphile-worker logs without a fatal error on the console only", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, createPool: vi.fn().mockReturnValue(new FakePool()), captureException },
    );
    const [options] = runWorker.mock.calls[0] as [RunnerOptions];
    const logger = mustExist(options.logger, "the logger passed to graphile-worker's run()");
    logger.error("Failed task 1 (recovery-request) with error malformed job payload", {
      error: new Error("malformed job payload"),
    });

    expect(captureException).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.map(String).join(" ")).toContain(
      "Failed task 1 (recovery-request) with error malformed job payload",
    );
  });

  it("runs more than one job at a time, so one slow job never holds up every other one", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker },
    );

    const [options] = runWorker.mock.calls[0] as [{ concurrency?: number }];
    expect(options.concurrency).toBeGreaterThan(1);
  });

  it("processes a job through a client borrowed from graphile-worker's own pool", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const fakeClient = { marker: "fake-client" };
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback(fakeClient),
    );
    const processJob = vi.fn().mockRejectedValue(new Error("boom"));

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
        now: () => new Date("2026-01-05T12:00:00.000Z"),
      },
      { runWorker, createDatabase, processJob },
    );

    const [options] = runWorker.mock.calls[0] as [
      {
        taskList: Record<
          string,
          (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
        >;
      },
    ];
    const task = mustExist(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
      "the registered recovery-request task",
    );

    const payload = {
      email: "ada@example.com",
      requestedAt: "2026-01-05T12:00:00.000Z",
      requestId: "0b8e5c2a-3f4d-4e6a-9b1c-2d3e4f5a6b7c",
    };
    await expect(task(payload, { withPgClient })).rejects.toThrow("boom");

    expect(withPgClient).toHaveBeenCalledTimes(1);
    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(processJob).toHaveBeenCalledWith(
      fakeDb,
      payload,
      expect.objectContaining({ backofficeOrigin: "https://staging.purosur.online" }),
    );
  });

  it("releases the pool client before sending the email it issued a link for", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const events: string[] = [];
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) => {
      const result = await callback({ marker: "fake-client" });
      events.push("withPgClient resolved");
      return result;
    });
    const processJob = vi.fn().mockResolvedValue({
      send: {
        email: {
          to: "ada@example.com",
          link: "https://staging.purosur.online/account-recovery/passkey#raw",
        },
        tokenId: "token-1",
      },
    });
    const sendRecoveryLink = vi.fn().mockImplementation(async () => {
      events.push("sendRecoveryLink called");
    });
    const recordLinkSent = vi.fn().mockResolvedValue({ kind: "recorded" });

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender: { sendRecoveryLink, sendFirstPinCode: vi.fn() },
      },
      { runWorker, processJob, recordLinkSent },
    );

    const [options] = runWorker.mock.calls[0] as [
      {
        taskList: Record<
          string,
          (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
        >;
      },
    ];
    const task = mustExist(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
      "the registered recovery-request task",
    );

    await task(
      {
        email: "ada@example.com",
        requestedAt: "2026-01-05T12:00:00.000Z",
        requestId: "0b8e5c2a-3f4d-4e6a-9b1c-2d3e4f5a6b7c",
      },
      { withPgClient },
    );

    expect(events).toEqual([
      "withPgClient resolved",
      "sendRecoveryLink called",
      "withPgClient resolved",
    ]);
  });

  it("propagates a failed send so graphile-worker retries the job, after the client was released", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({ marker: "fake-client" }),
    );
    const processJob = vi.fn().mockResolvedValue({
      send: {
        email: {
          to: "ada@example.com",
          link: "https://staging.purosur.online/account-recovery/passkey#raw",
        },
        tokenId: "token-1",
      },
    });
    const sendRecoveryLink = vi.fn().mockRejectedValue(new Error("resend unavailable"));

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender: { sendRecoveryLink, sendFirstPinCode: vi.fn() },
      },
      { runWorker, processJob },
    );

    const [options] = runWorker.mock.calls[0] as [
      {
        taskList: Record<
          string,
          (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
        >;
      },
    ];
    const task = mustExist(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
      "the registered recovery-request task",
    );

    await expect(
      task(
        {
          email: "ada@example.com",
          requestedAt: "2026-01-05T12:00:00.000Z",
          requestId: "0b8e5c2a-3f4d-4e6a-9b1c-2d3e4f5a6b7c",
        },
        { withPgClient },
      ),
    ).rejects.toThrow("resend unavailable");
    expect(withPgClient).toHaveBeenCalledTimes(1);
  });

  it("never calls the email sender when the job issued nothing to send", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({ marker: "fake-client" }),
    );
    const processJob = vi.fn().mockResolvedValue({});
    const sendRecoveryLink = vi.fn();

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender: { sendRecoveryLink, sendFirstPinCode: vi.fn() },
      },
      { runWorker, processJob },
    );

    const [options] = runWorker.mock.calls[0] as [
      {
        taskList: Record<
          string,
          (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
        >;
      },
    ];
    const task = mustExist(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
      "the registered recovery-request task",
    );

    await task(
      {
        email: "ada@example.com",
        requestedAt: "2026-01-05T12:00:00.000Z",
        requestId: "0b8e5c2a-3f4d-4e6a-9b1c-2d3e4f5a6b7c",
      },
      { withPgClient },
    );

    expect(sendRecoveryLink).not.toHaveBeenCalled();
  });

  describe("recording that a recovery link was sent", () => {
    async function recoveryRequestTask(deps: {
      processJob: ReturnType<typeof vi.fn>;
      recordLinkSent: ReturnType<typeof vi.fn>;
      sendRecoveryLink: ReturnType<typeof vi.fn>;
      createDatabase?: ReturnType<typeof vi.fn>;
    }) {
      const runWorker = vi.fn().mockResolvedValue(fakeRunner());
      await startRecoveryWorker(
        {
          databaseUrl: "postgres://user:pass@db/purosur",
          now: () => FIXED_NOW,
          backofficeOrigin: "https://staging.purosur.online",
          emailSender: { sendRecoveryLink: deps.sendRecoveryLink, sendFirstPinCode: vi.fn() },
        },
        {
          runWorker,
          processJob: deps.processJob,
          recordLinkSent: deps.recordLinkSent,
          createDatabase: deps.createDatabase ?? vi.fn(),
        },
      );
      const [options] = runWorker.mock.calls[0] as [
        {
          taskList: Record<
            string,
            (
              payload: unknown,
              helpers: {
                withPgClient: (callback: (client: unknown) => Promise<unknown>) => Promise<unknown>;
              },
            ) => Promise<void>
          >;
        },
      ];
      return mustExist(
        options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
        "the registered recovery-request task",
      );
    }

    const payload = {
      email: "ada@example.com",
      requestedAt: "2026-01-05T12:00:00.000Z",
      requestId: "0b8e5c2a-3f4d-4e6a-9b1c-2d3e4f5a6b7c",
    };
    const issued = {
      send: {
        email: {
          to: "ada@example.com",
          link: "https://staging.purosur.online/account-recovery/passkey#raw",
        },
        tokenId: "token-1",
      },
    };

    it("records the send of the issued token through a second client, after the client of the job was released and the link was sent", async () => {
      const events: string[] = [];
      const fakeDb = { marker: "fake-db" };
      const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) => {
        events.push("client borrowed");
        const result = await callback({ marker: "fake-client" });
        events.push("client released");
        return result;
      });
      const task = await recoveryRequestTask({
        processJob: vi.fn().mockResolvedValue(issued),
        sendRecoveryLink: vi.fn().mockImplementation(async () => {
          events.push("link sent");
        }),
        recordLinkSent: vi.fn().mockImplementation(async () => {
          events.push("send recorded");
        }),
        createDatabase: vi.fn().mockReturnValue(fakeDb),
      });

      await task(payload, { withPgClient });

      expect(events).toEqual([
        "client borrowed",
        "client released",
        "link sent",
        "client borrowed",
        "send recorded",
        "client released",
      ]);
    });

    it("records the send with the database of the second client, the token id and the worker's clock", async () => {
      const fakeDb = { marker: "fake-db" };
      const recordLinkSent = vi.fn().mockResolvedValue({ kind: "recorded" });
      const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback({ marker: "fake-client" }),
      );
      const task = await recoveryRequestTask({
        processJob: vi.fn().mockResolvedValue(issued),
        sendRecoveryLink: vi.fn().mockResolvedValue(undefined),
        recordLinkSent,
        createDatabase: vi.fn().mockReturnValue(fakeDb),
      });

      await task(payload, { withPgClient });

      expect(recordLinkSent).toHaveBeenCalledWith(fakeDb, "token-1", expect.any(Object));
      const [, , deps] = recordLinkSent.mock.calls[0] as [unknown, unknown, { now: () => Date }];
      expect(deps.now()).toEqual(FIXED_NOW);
    });

    it("records nothing and rethrows when the send fails", async () => {
      const recordLinkSent = vi.fn();
      const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback({ marker: "fake-client" }),
      );
      const task = await recoveryRequestTask({
        processJob: vi.fn().mockResolvedValue(issued),
        sendRecoveryLink: vi.fn().mockRejectedValue(new Error("resend unavailable")),
        recordLinkSent,
      });

      await expect(task(payload, { withPgClient })).rejects.toThrow("resend unavailable");

      expect(recordLinkSent).not.toHaveBeenCalled();
      expect(withPgClient).toHaveBeenCalledTimes(1);
    });

    it("records nothing when the job had nothing to send", async () => {
      const recordLinkSent = vi.fn();
      const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback({ marker: "fake-client" }),
      );
      const task = await recoveryRequestTask({
        processJob: vi.fn().mockResolvedValue({}),
        sendRecoveryLink: vi.fn(),
        recordLinkSent,
      });

      await task(payload, { withPgClient });

      expect(recordLinkSent).not.toHaveBeenCalled();
      expect(withPgClient).toHaveBeenCalledTimes(1);
    });

    it("fails the job when recording the send fails, so graphile-worker retries it", async () => {
      const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback({ marker: "fake-client" }),
      );
      const task = await recoveryRequestTask({
        processJob: vi.fn().mockResolvedValue(issued),
        sendRecoveryLink: vi.fn().mockResolvedValue(undefined),
        recordLinkSent: vi.fn().mockRejectedValue(new Error("database down")),
      });

      await expect(task(payload, { withPgClient })).rejects.toThrow("database down");
    });
  });

  it("rejects a malformed payload without ever borrowing a database client", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const withPgClient = vi.fn();

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        now: () => FIXED_NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker },
    );

    const [options] = runWorker.mock.calls[0] as [
      {
        taskList: Record<
          string,
          (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
        >;
      },
    ];
    const task = mustExist(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
      "the registered recovery-request task",
    );

    await expect(task({}, { withPgClient })).rejects.toThrow();
    await expect(task({ email: "ada@example.com" }, { withPgClient })).rejects.toThrow();
    await expect(
      task(
        {
          email: "ada@example.com",
          requestedAt: "not-a-date",
          requestId: "0b8e5c2a-3f4d-4e6a-9b1c-2d3e4f5a6b7c",
        },
        { withPgClient },
      ),
    ).rejects.toThrow();
    await expect(
      task(
        {
          email: "ada@example.com",
          requestedAt: "2026-01-05T12:00:00.000Z",
          requestId: 42,
        },
        { withPgClient },
      ),
    ).rejects.toThrow();
    await expect(
      task(
        {
          email: "ada@example.com",
          requestedAt: "2026-01-05T12:00:00.000Z",
          requestId: "not-a-uuid",
        },
        { withPgClient },
      ),
    ).rejects.toThrow();
    expect(withPgClient).not.toHaveBeenCalled();
  });

  it.each([
    ["with a time zone offset", "2026-01-05T12:00:00+03:00"],
    ["holding only a date", "2026-01-05"],
  ])(
    "fails a job whose request time is a readable date %s, which the queue never writes, without borrowing a database client",
    async (_shape, requestedAt) => {
      const runWorker = vi.fn().mockResolvedValue(fakeRunner());
      const withPgClient = vi.fn();

      await startRecoveryWorker(
        {
          databaseUrl: "postgres://user:pass@db/purosur",
          now: () => FIXED_NOW,
          backofficeOrigin: "https://staging.purosur.online",
          emailSender,
        },
        { runWorker },
      );

      const [options] = runWorker.mock.calls[0] as [
        {
          taskList: Record<
            string,
            (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
          >;
        },
      ];
      const task = mustExist(
        options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
        "the registered recovery-request task",
      );

      await expect(
        task(
          {
            email: "ada@example.com",
            requestedAt,
            requestId: "0b8e5c2a-3f4d-4e6a-9b1c-2d3e4f5a6b7c",
          },
          { withPgClient },
        ),
      ).rejects.toThrow("malformed job payload");
      expect(withPgClient).not.toHaveBeenCalled();
    },
  );

  it("fails a job whose request id the queue never creates, recording nothing even for an inactive account", {
    timeout: 30_000,
  }, async () => {
    const testDatabase = await buildTestDatabase();
    try {
      await testDatabase.db.insert(users).values({
        firstName: "Ada",
        email: "ada@example.com",
        active: false,
        locationId: await seededLocationId(testDatabase.db),
      });
      const runWorker = vi.fn().mockResolvedValue(fakeRunner());
      const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback({ marker: "fake-client" }),
      );

      await startRecoveryWorker(
        {
          databaseUrl: "postgres://user:pass@db/purosur",
          now: () => FIXED_NOW,
          backofficeOrigin: "https://staging.purosur.online",
          emailSender,
        },
        {
          runWorker,
          createDatabase: vi.fn(),
          processJob: (_db, payload, deps) =>
            processRecoveryRequestJob(testDatabase.db, payload, deps),
        },
      );

      const [options] = runWorker.mock.calls[0] as [
        {
          taskList: Record<
            string,
            (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
          >;
        },
      ];
      const task = mustExist(
        options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
        "the registered recovery-request task",
      );

      await expect(
        task(
          {
            email: "ada@example.com",
            requestedAt: "2026-01-05T12:00:00.000Z",
            requestId: "not-a-uuid",
          },
          { withPgClient },
        ),
      ).rejects.toThrow("malformed job payload");
      expect(await testDatabase.db.select().from(auditLog)).toEqual([]);
    } finally {
      await testDatabase.close();
    }
  });

  it("sends a first PIN code email through the sender once the code read through graphile-worker's client is live, leaving a malformed payload or a failed send to graphile-worker's retry", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const sendFirstPinCode = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fakeClient = { marker: "fake-client" };
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback(fakeClient),
    );
    const findPinCode = vi.fn().mockResolvedValue({
      expiresAt: new Date("2026-09-30T12:15:00.000Z"),
      redeemedAt: null,
      supersededAt: null,
      failedAttempts: 0,
    });

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender: { sendRecoveryLink: vi.fn(), sendFirstPinCode },
        now: () => new Date("2026-09-30T12:00:00.000Z"),
      },
      { runWorker, createDatabase, findPinCode },
    );

    const [options] = runWorker.mock.calls[0] as [
      {
        taskList: Record<
          string,
          (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
        >;
      },
    ];
    const task = mustExist(
      options.taskList[FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER],
      "the registered first PIN code email task",
    );
    const payload = {
      email: "grace@example.com",
      code: "K3PX7WNE2QRT6MZD",
    };

    await task(payload, { withPgClient });
    expect(createDatabase).toHaveBeenCalledExactlyOnceWith(fakeClient);
    expect(findPinCode).toHaveBeenCalledExactlyOnceWith(fakeDb, "K3PX7WNE2QRT6MZD");
    expect(sendFirstPinCode).toHaveBeenCalledExactlyOnceWith({
      to: "grace@example.com",
      code: "K3PX7WNE2QRT6MZD",
    });
    await expect(task(payload, { withPgClient })).rejects.toThrow("down");
    await expect(task({}, { withPgClient })).rejects.toThrow("malformed job payload");
  });

  it("processes the rejected-attempt flush task through a client borrowed from graphile-worker's own pool", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const fakeClient = { marker: "fake-client" };
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback(fakeClient),
    );
    const flush = vi.fn().mockResolvedValue(0);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
        now: () => new Date("2026-01-05T12:00:00.000Z"),
      },
      { runWorker, createDatabase, flush },
    );

    const [options] = runWorker.mock.calls[0] as [
      {
        taskList: Record<
          string,
          (payload: unknown, helpers: { withPgClient: typeof withPgClient }) => Promise<void>
        >;
      },
    ];
    const task = mustExist(
      options.taskList[RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER],
      "the registered rejected-attempt flush task",
    );

    await task({}, { withPgClient });

    expect(withPgClient).toHaveBeenCalledTimes(1);
    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(flush).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ now: expect.any(Function) }),
    );
  });
});

describe("the recovery worker's clock", () => {
  it("is required to start the worker", () => {
    expectTypeOf<
      Omit<StartRecoveryWorkerOptions, "now">
    >().not.toExtend<StartRecoveryWorkerOptions>();
  });
});
