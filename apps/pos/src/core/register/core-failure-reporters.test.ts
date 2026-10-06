import { describe, expect, it } from "vitest";
import { coreFailureReporters } from "./core-failure-reporters";

function recordingReporters() {
  const events: unknown[][] = [];
  const reporters = coreFailureReporters({
    log: (message, error) => events.push(["logged", message, error]),
    capture: (error) => events.push(["captured", error]),
    watchFailure: async (error) => {
      events.push(["watched", error]);
    },
  });
  return { events, reporters };
}

const FAILURE = new Error("the disk is full");

describe("coreFailureReporters", () => {
  it("logs and captures a failed request and hands it to the damage watch", () => {
    const { events, reporters } = recordingReporters();

    reporters.reportFailure("signing in", FAILURE);

    expect(events).toEqual([
      ["logged", "core: signing in failed", FAILURE],
      ["captured", FAILURE],
      ["watched", FAILURE],
    ]);
  });

  it("logs a failed sync without capturing it and hands it to the damage watch", () => {
    const { events, reporters } = recordingReporters();

    reporters.reportSyncFailure(FAILURE);

    expect(events).toEqual([
      ["logged", "core: the sync failed", FAILURE],
      ["watched", FAILURE],
    ]);
  });

  it("logs and captures a redeemed PIN it could not keep and hands it to the damage watch", () => {
    const { events, reporters } = recordingReporters();

    reporters.reportRedeemedPinFailure(FAILURE);

    expect(events).toEqual([
      ["logged", "core: the redeemed PIN could not be kept locally", FAILURE],
      ["captured", FAILURE],
      ["watched", FAILURE],
    ]);
  });
});
