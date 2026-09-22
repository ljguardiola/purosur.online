import { describe, expect, it, vi } from "vitest";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";
import {
  type DatabaseConnection,
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

  it("processes an admitted job through a connection it opens and closes, even when processing fails", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const fakeDb = { marker: "fake-db" };
    const close = vi.fn().mockResolvedValue(undefined);
    const connectToDatabase = vi.fn(
      (): DatabaseConnection => ({ db: fakeDb as unknown as DatabaseConnection["db"], close }),
    );
    const processJob = vi.fn().mockRejectedValue(new Error("boom"));

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
        now: () => new Date("2026-01-05T12:00:00.000Z"),
      },
      { runWorker, connectToDatabase, processJob },
    );

    const [options] = runWorker.mock.calls[0] as [
      { taskList: Record<string, (payload: unknown) => Promise<void>> },
    ];
    const task = mustExist(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
      "the registered recovery-request task",
    );

    await expect(task({ email: "ada@example.com" })).rejects.toThrow("boom");

    expect(connectToDatabase).toHaveBeenCalledWith("postgres://user:pass@db/purosur");
    expect(processJob).toHaveBeenCalledWith(
      fakeDb,
      { email: "ada@example.com" },
      expect.objectContaining({
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed payload without ever opening a database connection", async () => {
    const runner = fakeRunner();
    const runWorker = vi.fn().mockResolvedValue(runner);
    const connectToDatabase = vi.fn();

    await startRecoveryWorker(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
      { runWorker, connectToDatabase },
    );

    const [options] = runWorker.mock.calls[0] as [
      { taskList: Record<string, (payload: unknown) => Promise<void>> },
    ];
    const task = mustExist(
      options.taskList[RECOVERY_REQUEST_TASK_IDENTIFIER],
      "the registered recovery-request task",
    );

    await expect(task({})).rejects.toThrow();
    expect(connectToDatabase).not.toHaveBeenCalled();
  });
});
