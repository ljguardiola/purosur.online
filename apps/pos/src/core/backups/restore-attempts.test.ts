import { describe, expect, it } from "vitest";
import { createRestoreAttempts } from "./restore-attempts";
import type { RestorePending } from "./restore-pending";

function setup({ pendingNow = true, launches = true, resetFails = false } = {}) {
  const calls: string[] = [];
  const cloudAnswers: boolean[] = [];
  const resets: { installation_id: string; register_id: string }[] = [];
  let pending = pendingNow;
  const restorePending: RestorePending = {
    isPending: () => pending,
    deviceId: () => (pending ? "device-new" : undefined),
    setsAsideLiveDatabase: () => false,
    settleSetAside: () => undefined,
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
    cloudAnswered: (reachable) => cloudAnswers.push(reachable),
    resetWithoutCopy: async (firstInstallation) => {
      calls.push("reset");
      resets.push(firstInstallation);
      if (resetFails) {
        throw new Error("storage unavailable");
      }
    },
  });
  return { attempts, calls, cloudAnswers, resets };
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

describe("a restore that finds no copy of a register that had a first installation", () => {
  const FIRST = { installation_id: "installation-1", register_id: "register-1" };

  it("records the first installation as the predecessor, then clears the restore and resumes syncing", async () => {
    const { attempts, calls, resets } = setup();
    await attempts.attempt();

    await attempts.workerExited("no_generation", FIRST);

    expect(resets).toEqual([FIRST]);
    expect(calls).toEqual(["launch", "reset", "clear", "sync"]);
  });

  it("keeps the restore pending and resumes nothing when recording the predecessor fails", async () => {
    const { attempts, calls } = setup({ resetFails: true });
    await attempts.attempt();

    await expect(attempts.workerExited("no_generation", FIRST)).rejects.toThrow(
      "storage unavailable",
    );

    expect(calls).toEqual(["launch", "reset"]);
  });

  it("launches the restore again after recording the predecessor failed", async () => {
    const { attempts, calls } = setup({ resetFails: true });
    await attempts.attempt();
    await attempts.workerExited("no_generation", FIRST).catch(() => undefined);

    await attempts.attempt();

    expect(calls).toEqual(["launch", "reset", "launch"]);
  });

  it("records no predecessor for any other outcome", async () => {
    const { attempts, resets } = setup();
    await attempts.attempt();

    await attempts.workerExited("unreachable", FIRST);

    expect(resets).toEqual([]);
  });

  it("records no predecessor when the register had no first installation", async () => {
    const { attempts, resets } = setup();
    await attempts.attempt();

    await attempts.workerExited("no_generation", undefined);

    expect(resets).toEqual([]);
  });
});

describe("what a restore says about the cloud", () => {
  it("says nothing about the cloud while the restore has not ended", async () => {
    const { attempts, cloudAnswers } = setup();

    await attempts.attempt();

    expect(cloudAnswers).toEqual([]);
  });

  it("says the cloud was not reached once the restore could not reach it", async () => {
    const { attempts, cloudAnswers } = setup();
    await attempts.attempt();

    attempts.workerExited("unreachable");

    expect(cloudAnswers).toEqual([false]);
  });

  it.each(["restored", "no_generation", "none_usable"] as const)(
    "says the cloud was reached once the restore ended %s",
    async (outcome) => {
      const { attempts, cloudAnswers } = setup();
      await attempts.attempt();

      attempts.workerExited(outcome);

      expect(cloudAnswers).toEqual([true]);
    },
  );

  it("says nothing about the cloud when the worker ended with no outcome", async () => {
    const { attempts, cloudAnswers } = setup();
    await attempts.attempt();

    attempts.workerExited(undefined);

    expect(cloudAnswers).toEqual([]);
  });
});

describe("whether any snapshot could be used", () => {
  it("holds that one may be usable before any restore ended", () => {
    expect(setup().attempts.noUsableGeneration()).toBe(false);
  });

  it("holds that none is usable once a restore ended with none usable", async () => {
    const { attempts } = setup();
    await attempts.attempt();

    attempts.workerExited("none_usable");

    expect(attempts.noUsableGeneration()).toBe(true);
  });

  it.each(["unreachable", "restored", "no_generation", undefined] as const)(
    "holds that one may be usable once a restore ended %s",
    async (outcome) => {
      const { attempts } = setup();
      await attempts.attempt();

      attempts.workerExited(outcome);

      expect(attempts.noUsableGeneration()).toBe(false);
    },
  );
});
