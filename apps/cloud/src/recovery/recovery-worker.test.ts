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

function mustExist<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`test setup: expected ${description}`);
  }
  return value;
}

describe("startRecoveryWorker", () => {
  it("starts graphile-worker against the given connection string with the recovery-request task", async () => {
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

    expect(runWorker).toHaveBeenCalledTimes(1);
    const [options] = runWorker.mock.calls[0] as [{ connectionString: string; taskList: object }];
    expect(options.connectionString).toBe("postgres://user:pass@db/purosur");
    expect(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER as keyof typeof options.taskList],
    ).toBeInstanceOf(Function);
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

  it("delegates stop() to the runner returned by graphile-worker", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);

    const handle = await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker },
    );
    await handle.stop();

    expect(runner.stop).toHaveBeenCalledTimes(1);
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
      send: { to: "ada@example.com", link: "https://staging.purosur.online/recuperar/enlace#raw" },
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
      send: { to: "ada@example.com", link: "https://staging.purosur.online/recuperar/enlace#raw" },
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
