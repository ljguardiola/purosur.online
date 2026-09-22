import { EventEmitter } from "node:events";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";
import {
  RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER,
  RECOVERY_REQUEST_TASK_IDENTIFIER,
  startRecoveryWorker,
} from "./recovery-worker.js";

const emailSender: RecoveryEmailSender = { sendRecoveryLink: vi.fn() };

function fakeRunner() {
  return { stop: vi.fn().mockResolvedValue(undefined) };
}

/**
 * Stands in for the `pg.Pool` `startRecoveryWorker` now owns itself, so a test can assert its
 * error handler stays installed and that `stop()` actually awaits closing it, without opening a
 * real socket.
 */
class FakePool extends EventEmitter {
  readonly end = vi.fn().mockResolvedValue(undefined);
}

function mustExist<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`test setup: expected ${description}`);
  }
  return value;
}

describe("startRecoveryWorker", () => {
  it("starts graphile-worker against its own pool for the given connection string, with the recovery-request task", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
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

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, createPool },
    );

    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    expect(() => pool.emit("error", new Error("idle client disconnected"))).not.toThrow();
  });

  it("installs a connect handler on the pool it owns, so graphile-worker's own assertPool never installs (and later removes) its own", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, createPool },
    );

    expect(pool.listenerCount("connect")).toBeGreaterThan(0);
    const client = new EventEmitter();
    pool.emit("connect", client);
    const error = new Error("connection terminated unexpectedly");

    expect(client.listenerCount("error")).toBeGreaterThan(0);
    expect(() => client.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "recovery worker: active database client failed",
      error,
    );

    consoleError.mockRestore();
  });

  it("registers the rejected-attempt flush task and schedules it every 5 minutes", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
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
    expect(options.crontab).toBe("*/5 * * * * recovery-rejected-attempt-flush");
  });

  it("delegates stop() to the runner returned by graphile-worker, then awaits closing the pool it owns", async () => {
    const events: string[] = [];
    const runner = {
      stop: vi.fn().mockImplementation(async () => {
        events.push("runner stopped");
      }),
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
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, createPool },
    );
    await handle.stop();

    expect(runner.stop).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    // The runner must fully stop using the pool before we close it, so a job the runner is still
    // draining never sees its connection cut from under it.
    expect(events).toEqual(["runner stopped", "pool ended"]);
  });

  it("runs more than one job at a time, so one slow job never holds up every other one", async () => {
    const runWorker = vi.fn().mockResolvedValue(fakeRunner());

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
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
        to: "ada@example.com",
        link: "https://staging.purosur.online/account-recovery/passkey#raw",
      },
    });
    const sendRecoveryLink = vi.fn().mockImplementation(async () => {
      events.push("sendRecoveryLink called");
    });

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender: { sendRecoveryLink },
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

    expect(events).toEqual(["withPgClient resolved", "sendRecoveryLink called"]);
  });

  it("propagates a failed send so graphile-worker retries the job, after the client was released", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({ marker: "fake-client" }),
    );
    const processJob = vi.fn().mockResolvedValue({
      send: {
        to: "ada@example.com",
        link: "https://staging.purosur.online/account-recovery/passkey#raw",
      },
    });
    const sendRecoveryLink = vi.fn().mockRejectedValue(new Error("resend unavailable"));

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender: { sendRecoveryLink },
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
        backofficeOrigin: "https://staging.purosur.online",
        emailSender: { sendRecoveryLink },
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

  it("rejects a malformed payload without ever borrowing a database client", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const withPgClient = vi.fn();

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
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
          requestId: "not-a-uuid",
        },
        { withPgClient },
      ),
    ).rejects.toThrow();
    expect(withPgClient).not.toHaveBeenCalled();
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
