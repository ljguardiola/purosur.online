import { describe, expect, it } from "vitest";
import { createRestoreAttempts } from "./restore-attempts";
import type { RestorePending } from "./restore-pending";

function setup({ pendingNow = true, launches = true } = {}) {
  const calls: string[] = [];
  let pending = pendingNow;
  const restorePending: RestorePending = {
    isPending: () => pending,
    deviceId: () => (pending ? "device-new" : undefined),
    begin: () => {
      pending = true;
    },
    clear: () => {
      calls.push("clear");
      pending = false;
    },
  };
  const attempts = createRestoreAttempts({
    pending: restorePending,
    launch: async () => {
      calls.push("launch");
      return launches;
    },
    restartCore: () => calls.push("restart"),
    resumeSync: () => calls.push("sync"),
    reportNoUsableGeneration: () => calls.push("report"),
  });
  return { attempts, calls };
}

describe("attempting the restore", () => {
  it("launches the restore while it is pending", async () => {
    const { attempts, calls } = setup();

    await attempts.attempt();

    expect(calls).toEqual(["launch"]);
  });

  it("launches nothing when no restore is pending", async () => {
    const { attempts, calls } = setup({ pendingNow: false });

    await attempts.attempt();

    expect(calls).toEqual([]);
  });

  it("launches no second restore while one is running", async () => {
    const { attempts, calls } = setup();

    await Promise.all([attempts.attempt(), attempts.attempt()]);
    await attempts.attempt();

    expect(calls).toEqual(["launch"]);
  });

  it("launches the restore again once one ended unable to reach the cloud", async () => {
    const { attempts, calls } = setup();
    await attempts.attempt();

    attempts.workerExited("unreachable");
    await attempts.attempt();

    expect(calls).toEqual(["launch", "launch"]);
  });

  it("launches the restore again once its worker ended with no outcome", async () => {
    const { attempts, calls } = setup();
    await attempts.attempt();

    attempts.workerExited(undefined);
    await attempts.attempt();

    expect(calls).toEqual(["launch", "launch"]);
  });

  it("launches the restore again when the last launch could not start", async () => {
    const { attempts, calls } = setup({ launches: false });

    await attempts.attempt();
    await attempts.attempt();

    expect(calls).toEqual(["launch", "launch"]);
  });

  it("reports and launches no further restore once no snapshot could be used", async () => {
    const { attempts, calls } = setup();
    await attempts.attempt();

    attempts.workerExited("none_usable");
    await attempts.attempt();

    expect(calls).toEqual(["launch", "report"]);
  });

  it("restarts the core to adopt the staged database once a snapshot was restored", async () => {
    const { attempts, calls } = setup();
    await attempts.attempt();

    attempts.workerExited("restored");

    expect(calls).toEqual(["launch", "restart"]);
  });

  it("stops restoring and resumes syncing when the register has no snapshot", async () => {
    const { attempts, calls } = setup();
    await attempts.attempt();

    attempts.workerExited("no_generation");
    await attempts.attempt();

    expect(calls).toEqual(["launch", "clear", "sync"]);
  });
});
