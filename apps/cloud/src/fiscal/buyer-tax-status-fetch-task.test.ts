import type { JobHelpers } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import {
  BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
  BUYER_TAX_STATUS_FETCH_WATCHDOG_TASK_IDENTIFIER,
  buyerTaxStatusFetchJobs,
  enqueueBuyerTaxStatusFetch,
} from "./buyer-tax-status-fetch-task.js";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const NEXT_FETCH_AT = new Date("2026-06-01T13:00:00.000Z");
const A_MINUTE_LATER = new Date("2026-06-01T12:01:00.000Z");
const source = { fetchBuyerTaxStatusSet: vi.fn() };
const options = { now: () => NOW, source, certificateFingerprint: "AA:BB" };

function helpersOf() {
  const fakeClient = { marker: "fake-client" };
  const addJob = vi.fn().mockResolvedValue(undefined);
  const withPgClient = vi.fn(async (callback: (client: unknown) => Promise<unknown>) =>
    callback(fakeClient),
  );
  return {
    fakeClient,
    addJob,
    helpers: { addJob, withPgClient } as unknown as JobHelpers,
  };
}

function taskOf(jobs: ReturnType<typeof buyerTaxStatusFetchJobs>, identifier: string) {
  const task = jobs.taskList[identifier];
  if (!task) {
    throw new Error(`test setup: expected the registered task ${identifier}`);
  }
  return task;
}

describe("buyerTaxStatusFetchJobs", () => {
  it("registers the fetch and its watchdog, and runs the watchdog every minute", () => {
    const jobs = buyerTaxStatusFetchJobs(options);

    expect(jobs.taskList[BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.taskList[BUYER_TAX_STATUS_FETCH_WATCHDOG_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toEqual(["* * * * * buyer-tax-status-fetch-watchdog"]);
  });

  it("fetches through a client borrowed from graphile-worker's pool, with the injected source, certificate and clock", async () => {
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const fetch = vi.fn().mockResolvedValue({ kind: "unchanged", nextFetchAt: NEXT_FETCH_AT });
    const { helpers, fakeClient } = helpersOf();
    const jobs = buyerTaxStatusFetchJobs(options, { createDatabase, fetch });

    await taskOf(jobs, BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER)({}, helpers);

    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(fetch).toHaveBeenCalledWith(fakeDb, options);
  });

  it("schedules the next fetch when the outcome says, replacing any fetch already scheduled under its key", async () => {
    const { helpers, addJob } = helpersOf();
    const jobs = buyerTaxStatusFetchJobs(options, {
      createDatabase: vi.fn(),
      fetch: vi.fn().mockResolvedValue({ kind: "unchanged", nextFetchAt: NEXT_FETCH_AT }),
    });

    await taskOf(jobs, BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER)({}, helpers);

    expect(addJob).toHaveBeenCalledWith(
      BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
      {},
      {
        jobKey: BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
        jobKeyMode: "replace",
        runAt: NEXT_FETCH_AT,
      },
    );
  });

  it("schedules the next fetch as one that got no set when this one failed to run", async () => {
    const { helpers, addJob } = helpersOf();
    const jobs = buyerTaxStatusFetchJobs(options, {
      createDatabase: vi.fn(),
      fetch: vi.fn().mockRejectedValue(new Error("store down")),
    });

    await expect(taskOf(jobs, BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER)({}, helpers)).rejects.toThrow(
      "store down",
    );

    expect(addJob).toHaveBeenCalledWith(
      BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
      {},
      {
        jobKey: BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
        jobKeyMode: "replace",
        runAt: A_MINUTE_LATER,
      },
    );
  });

  it("has the watchdog add the fetch under the same key, keeping the run time of one already scheduled", async () => {
    const { helpers, addJob } = helpersOf();
    const jobs = buyerTaxStatusFetchJobs(options);

    await taskOf(jobs, BUYER_TAX_STATUS_FETCH_WATCHDOG_TASK_IDENTIFIER)({}, helpers);

    expect(addJob).toHaveBeenCalledWith(
      BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
      {},
      { jobKey: BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER, jobKeyMode: "preserve_run_at" },
    );
  });
});

describe("enqueueBuyerTaxStatusFetch", () => {
  it("runs the fetch now, in place of the one already scheduled under its key", async () => {
    const addJob = vi.fn().mockResolvedValue(undefined);

    await enqueueBuyerTaxStatusFetch({ addJob });

    expect(addJob).toHaveBeenCalledWith(
      BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
      {},
      { jobKey: BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER, jobKeyMode: "replace" },
    );
  });
});
