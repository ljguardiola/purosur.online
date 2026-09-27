import { describe, expect, it, vi } from "vitest";
import { runShutdownSteps } from "./run-shutdown-steps.js";

describe("runShutdownSteps", () => {
  it("runs every step in order when they all succeed", async () => {
    const calls: string[] = [];

    await runShutdownSteps([
      { label: "worker", run: async () => void calls.push("worker") },
      { label: "job-queue utilities", run: async () => void calls.push("job-queue utilities") },
      { label: "job-queue pool", run: async () => void calls.push("job-queue pool") },
      { label: "database client", run: async () => void calls.push("database client") },
    ]);

    expect(calls).toEqual(["worker", "job-queue utilities", "job-queue pool", "database client"]);
  });

  it("still runs every later step when an earlier one fails", async () => {
    const laterStep = vi.fn().mockResolvedValue(undefined);

    await expect(
      runShutdownSteps([
        {
          label: "worker",
          run: async () => {
            throw new Error("Runner is already stopped");
          },
        },
        { label: "job-queue utilities", run: laterStep },
      ]),
    ).rejects.toThrow();

    expect(laterStep).toHaveBeenCalledTimes(1);
  });

  it("rejects with the single failure, labelled, when exactly one step fails", async () => {
    await expect(
      runShutdownSteps([
        { label: "worker", run: async () => undefined },
        {
          label: "job-queue pool",
          run: async () => {
            throw new Error("pool already ended");
          },
        },
      ]),
    ).rejects.toThrow("job-queue pool failed to shut down: pool already ended");
  });

  it("rejects with an AggregateError listing every failure when more than one step fails", async () => {
    await expect(
      runShutdownSteps([
        {
          label: "worker",
          run: async () => {
            throw new Error("Runner is already stopped");
          },
        },
        {
          label: "database client",
          run: async () => {
            throw new Error("connection terminated unexpectedly");
          },
        },
      ]),
    ).rejects.toMatchObject({
      name: "AggregateError",
      errors: [
        expect.objectContaining({
          message: "worker failed to shut down: Runner is already stopped",
        }),
        expect.objectContaining({
          message: "database client failed to shut down: connection terminated unexpectedly",
        }),
      ],
    });
  });
});
