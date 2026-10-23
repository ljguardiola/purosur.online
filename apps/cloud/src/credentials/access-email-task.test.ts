import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { auditLog, users } from "../platform/db/schema.js";
import { buildTestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  type AccessEmailJobsDeps,
  type AccessEmailJobsInput,
  accessEmailJobs,
  FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER,
  RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER,
  RECOVERY_REQUEST_TASK_IDENTIFIER,
} from "./access-email-task.js";
import { processRecoveryRequestJob } from "./process-recovery-request-job.js";
import type { AccessEmailSender } from "./recovery-email-sender.js";

const emailSender: AccessEmailSender = { sendRecoveryLink: vi.fn(), sendFirstPinCode: vi.fn() };

const FIXED_NOW = new Date("2026-01-05T12:00:00.000Z");

interface TaskHelpers {
  withPgClient: (callback: (client: unknown) => Promise<unknown>) => Promise<unknown>;
}

type Task = (payload: unknown, helpers: TaskHelpers) => Promise<void>;

function mustExist<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`test setup: expected ${description}`);
  }
  return value;
}

function taskOf(
  identifier: string,
  setup: {
    deps?: AccessEmailJobsDeps;
    emailSender?: AccessEmailSender;
    now?: () => Date;
  } = {},
): Task {
  const jobs = accessEmailJobs(
    {
      now: setup.now ?? (() => FIXED_NOW),
      backofficeOrigin: "https://staging.purosur.online",
      emailSender: setup.emailSender ?? emailSender,
    },
    setup.deps,
  );
  return mustExist(jobs.taskList[identifier], `the registered ${identifier} task`) as Task;
}

describe("accessEmailJobs", () => {
  it("registers the recovery-request task", () => {
    const { taskList } = accessEmailJobs({
      now: () => FIXED_NOW,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender,
    });

    expect(taskList[RECOVERY_REQUEST_TASK_IDENTIFIER]).toBeInstanceOf(Function);
  });

  it("registers the rejected-attempt flush task and schedules it every 5 minutes", () => {
    const { taskList, crontab } = accessEmailJobs({
      now: () => FIXED_NOW,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender,
    });

    expect(taskList[RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(crontab).toEqual(["*/5 * * * * recovery-rejected-attempt-flush"]);
  });

  it("processes a job through a client borrowed from graphile-worker's own pool", async () => {
    const fakeClient = { marker: "fake-client" };
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback(fakeClient),
    );
    const processJob = vi.fn().mockRejectedValue(new Error("boom"));
    const task = taskOf(RECOVERY_REQUEST_TASK_IDENTIFIER, {
      deps: { createDatabase, processJob },
    });

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
    const task = taskOf(RECOVERY_REQUEST_TASK_IDENTIFIER, {
      emailSender: { sendRecoveryLink, sendFirstPinCode: vi.fn() },
      deps: { processJob, recordLinkSent },
    });

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
    const task = taskOf(RECOVERY_REQUEST_TASK_IDENTIFIER, {
      emailSender: { sendRecoveryLink, sendFirstPinCode: vi.fn() },
      deps: { processJob },
    });

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
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({ marker: "fake-client" }),
    );
    const processJob = vi.fn().mockResolvedValue({});
    const sendRecoveryLink = vi.fn();
    const task = taskOf(RECOVERY_REQUEST_TASK_IDENTIFIER, {
      emailSender: { sendRecoveryLink, sendFirstPinCode: vi.fn() },
      deps: { processJob },
    });

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
    function recoveryRequestTask(deps: {
      processJob: NonNullable<AccessEmailJobsDeps["processJob"]>;
      recordLinkSent: NonNullable<AccessEmailJobsDeps["recordLinkSent"]>;
      sendRecoveryLink: AccessEmailSender["sendRecoveryLink"];
      createDatabase?: AccessEmailJobsDeps["createDatabase"];
    }) {
      return taskOf(RECOVERY_REQUEST_TASK_IDENTIFIER, {
        emailSender: { sendRecoveryLink: deps.sendRecoveryLink, sendFirstPinCode: vi.fn() },
        deps: {
          processJob: deps.processJob,
          recordLinkSent: deps.recordLinkSent,
          createDatabase: deps.createDatabase ?? vi.fn(),
        },
      });
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
      const task = recoveryRequestTask({
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

    it("records the send with the database of the second client, the token id and the job's clock", async () => {
      const fakeDb = { marker: "fake-db" };
      const recordLinkSent = vi.fn().mockResolvedValue({ kind: "recorded" });
      const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback({ marker: "fake-client" }),
      );
      const task = recoveryRequestTask({
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
      const task = recoveryRequestTask({
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
      const task = recoveryRequestTask({
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
      const task = recoveryRequestTask({
        processJob: vi.fn().mockResolvedValue(issued),
        sendRecoveryLink: vi.fn().mockResolvedValue(undefined),
        recordLinkSent: vi.fn().mockRejectedValue(new Error("database down")),
      });

      await expect(task(payload, { withPgClient })).rejects.toThrow("database down");
    });
  });

  it("rejects a malformed payload without ever borrowing a database client", async () => {
    const withPgClient = vi.fn();
    const task = taskOf(RECOVERY_REQUEST_TASK_IDENTIFIER);

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
      const withPgClient = vi.fn();
      const task = taskOf(RECOVERY_REQUEST_TASK_IDENTIFIER);

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
      const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback({ marker: "fake-client" }),
      );
      const task = taskOf(RECOVERY_REQUEST_TASK_IDENTIFIER, {
        deps: {
          createDatabase: vi.fn(),
          processJob: (_db, payload, deps) =>
            processRecoveryRequestJob(testDatabase.db, payload, deps),
        },
      });

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
    const task = taskOf(FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER, {
      emailSender: { sendRecoveryLink: vi.fn(), sendFirstPinCode },
      now: () => new Date("2026-09-30T12:00:00.000Z"),
      deps: { createDatabase, findPinCode },
    });
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
    const fakeClient = { marker: "fake-client" };
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback(fakeClient),
    );
    const flush = vi.fn().mockResolvedValue(0);
    const task = taskOf(RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER, {
      deps: { createDatabase, flush },
    });

    await task({}, { withPgClient });

    expect(withPgClient).toHaveBeenCalledTimes(1);
    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(flush).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ now: expect.any(Function) }),
    );
  });
});

describe("the access email jobs' clock", () => {
  it("is required to build the jobs", () => {
    expectTypeOf<Omit<AccessEmailJobsInput, "now">>().not.toExtend<AccessEmailJobsInput>();
  });
});
