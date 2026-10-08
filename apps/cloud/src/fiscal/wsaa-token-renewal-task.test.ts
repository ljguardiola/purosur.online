import { describe, expect, it, vi } from "vitest";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER,
  wsaaTokenRenewalJobs,
} from "./wsaa-token-renewal-task.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const FINGERPRINT = "AB:CD:EF";

describe("wsaaTokenRenewalJobs", () => {
  const authentication = { requestToken: vi.fn() };

  it("registers the renewal task and schedules it every minute", () => {
    const jobs = wsaaTokenRenewalJobs({
      now: () => NOW,
      authentication,
      certificateFingerprint: FINGERPRINT,
    });

    expect(jobs.taskList[WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toEqual(["* * * * * wsaa-token-renewal"]);
  });

  it("renews the wsfe token of the loaded certificate through a client borrowed from graphile-worker's own pool", async () => {
    const { helpers, client: fakeClient } = buildJobHelpers();
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const renew = vi.fn().mockResolvedValue({ kind: "kept" });

    const jobs = wsaaTokenRenewalJobs(
      { now: () => NOW, authentication, certificateFingerprint: FINGERPRINT },
      { createDatabase, renew },
    );
    const task = jobs.taskList[WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered renewal task");
    }

    await task({}, helpers);

    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(renew).toHaveBeenCalledTimes(1);
    const [dbArgument, inputArgument] = renew.mock.calls[0] as [
      unknown,
      {
        now: () => Date;
        authentication: unknown;
        service: string;
        certificateFingerprint: string;
      },
    ];
    expect(dbArgument).toBe(fakeDb);
    expect(inputArgument.service).toBe("wsfe");
    expect(inputArgument.certificateFingerprint).toBe(FINGERPRINT);
    expect(inputArgument.authentication).toBe(authentication);
    expect(inputArgument.now()).toEqual(NOW);
  });
});
