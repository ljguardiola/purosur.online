import { describe, expect, it, vi } from "vitest";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import { ALERT_ESCALATION_TASK_IDENTIFIER, alertEscalationJobs } from "./alert-escalation-task.js";

describe("alertEscalationJobs", () => {
  it("registers the alert escalation task and schedules it every 5 minutes", () => {
    const jobs = alertEscalationJobs({ now: () => new Date() });

    expect(jobs.taskList[ALERT_ESCALATION_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toContain("*/5 * * * * alert-escalation");
  });

  it("processes the alert escalation task through a client borrowed from graphile-worker's own pool", async () => {
    const { helpers, borrowClient, client: fakeClient } = buildJobHelpers();
    const fakeDb = { marker: "fake-db" };
    const createDatabase = vi.fn().mockReturnValue(fakeDb);
    const escalate = vi.fn().mockResolvedValue(0);

    const jobs = alertEscalationJobs(
      { now: () => new Date("2026-01-05T12:00:00.000Z") },
      { createDatabase, escalate },
    );
    const task = jobs.taskList[ALERT_ESCALATION_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered alert escalation task");
    }

    await task({}, helpers);

    expect(borrowClient).toHaveBeenCalledTimes(1);
    expect(createDatabase).toHaveBeenCalledWith(fakeClient);
    expect(escalate).toHaveBeenCalledTimes(1);
    const [dbArgument, depsArgument] = escalate.mock.calls[0] as [unknown, { now: () => Date }];
    expect(dbArgument).toBe(fakeDb);
    expect(depsArgument.now()).toEqual(new Date("2026-01-05T12:00:00.000Z"));
  });
});
