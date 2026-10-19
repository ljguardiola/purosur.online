import { describe, expect, it } from "vitest";
import { handleRestoreOutcome } from "./restore-outcome";
import type { RestorePending } from "./restore-pending";

function setup() {
  const calls: string[] = [];
  const pending: RestorePending = {
    isPending: () => true,
    deviceId: () => "device-new",
    begin: () => calls.push("begin"),
    clear: () => calls.push("clear"),
  };
  const deps = {
    pending,
    restartCore: () => calls.push("restart"),
    resumeSync: () => calls.push("sync"),
    reportNoUsableGeneration: () => calls.push("report"),
  };
  return { calls, deps };
}

describe("handleRestoreOutcome", () => {
  it("restarts the core to adopt the staged database, keeping the restore pending", () => {
    const { calls, deps } = setup();

    handleRestoreOutcome("restored", deps);

    expect(calls).toEqual(["restart"]);
  });

  it("starts the register as a new one and resumes syncing when the register has no snapshot", () => {
    const { calls, deps } = setup();

    handleRestoreOutcome("no_generation", deps);

    expect(calls).toEqual(["clear", "sync"]);
  });

  it("keeps the restore pending and reports it when no snapshot could be used", () => {
    const { calls, deps } = setup();

    handleRestoreOutcome("none_usable", deps);

    expect(calls).toEqual(["report"]);
  });

  it("keeps the restore pending, saying nothing, when the cloud could not be reached", () => {
    const { calls, deps } = setup();

    handleRestoreOutcome("unreachable", deps);

    expect(calls).toEqual([]);
  });

  it("keeps the restore pending when the worker ended with no outcome", () => {
    const { calls, deps } = setup();

    handleRestoreOutcome(undefined, deps);

    expect(calls).toEqual([]);
  });
});
