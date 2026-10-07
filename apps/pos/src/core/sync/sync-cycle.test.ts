import { describe, expect, it } from "vitest";
import { runSyncCycle } from "./sync-cycle";
import { createSyncSchedule, type SyncResult } from "./sync-schedule";

const SUCCEEDED: SyncResult = { kind: "succeeded" };
const FAILED: SyncResult = { kind: "failed" };

function cycleWith(
  push: () => Promise<SyncResult>,
  pull: () => Promise<SyncResult>,
  checkInstallation: () => Promise<SyncResult> = async () => SUCCEEDED,
) {
  const order: string[] = [];
  const pushFailures: unknown[] = [];
  const checkFailures: unknown[] = [];
  const cycle = () =>
    runSyncCycle({
      checkInstallation: async () => {
        order.push("check");
        return checkInstallation();
      },
      push: async () => {
        order.push("push");
        return push();
      },
      pull: async () => {
        order.push("pull");
        return pull();
      },
      onPushFailure: (error) => pushFailures.push(error),
      onCheckFailure: (error) => checkFailures.push(error),
    });
  return { cycle, order, pushFailures, checkFailures };
}

describe("a sync cycle", () => {
  it("checks the installation with the cloud, pushes the outbox, then pulls the cloud's changes", async () => {
    const { cycle, order } = cycleWith(
      async () => SUCCEEDED,
      async () => SUCCEEDED,
    );

    expect(await cycle()).toEqual(SUCCEEDED);
    expect(order).toEqual(["check", "push", "pull"]);
  });

  it("still pushes and pulls when the check failed, and counts the cycle as failed", async () => {
    const { cycle, order } = cycleWith(
      async () => SUCCEEDED,
      async () => SUCCEEDED,
      async () => FAILED,
    );

    expect(await cycle()).toEqual(FAILED);
    expect(order).toEqual(["check", "push", "pull"]);
  });

  it("still pushes and pulls when the check throws, reporting the failure and counting the cycle as failed", async () => {
    const { cycle, order, checkFailures } = cycleWith(
      async () => SUCCEEDED,
      async () => SUCCEEDED,
      async () => {
        throw new Error("disk full");
      },
    );

    expect(await cycle()).toEqual(FAILED);
    expect(order).toEqual(["check", "push", "pull"]);
    expect(checkFailures).toEqual([new Error("disk full")]);
  });

  it("waits as long as the cloud asked the check to when that is the longest wait", async () => {
    const { cycle } = cycleWith(
      async () => ({ kind: "failed", retryAfterMs: 30_000 }),
      async () => SUCCEEDED,
      async () => ({ kind: "failed", retryAfterMs: 60_000 }),
    );

    expect(await cycle()).toEqual({ kind: "failed", retryAfterMs: 60_000 });
  });

  it("still pulls when the push failed, and counts the cycle as failed", async () => {
    const { cycle, order } = cycleWith(
      async () => FAILED,
      async () => SUCCEEDED,
    );

    expect(await cycle()).toEqual(FAILED);
    expect(order).toEqual(["check", "push", "pull"]);
  });

  it("counts the cycle as failed when only the pull failed", async () => {
    const { cycle } = cycleWith(
      async () => SUCCEEDED,
      async () => FAILED,
    );

    expect(await cycle()).toEqual(FAILED);
  });

  it("still pulls when the push throws, reporting the failure and counting the cycle as failed", async () => {
    const { cycle, order, pushFailures } = cycleWith(
      async () => {
        throw new Error("disk full");
      },
      async () => SUCCEEDED,
    );

    expect(await cycle()).toEqual(FAILED);
    expect(order).toEqual(["check", "push", "pull"]);
    expect(pushFailures).toEqual([new Error("disk full")]);
  });

  it("lets a pull that throws reach the schedule", async () => {
    const { cycle } = cycleWith(
      async () => SUCCEEDED,
      async () => {
        throw new Error("disk full");
      },
    );

    await expect(cycle()).rejects.toThrow("disk full");
  });

  it("waits as long as the cloud asked when only one of them asked", async () => {
    const asked = cycleWith(
      async () => ({ kind: "failed", retryAfterMs: 45_000 }),
      async () => SUCCEEDED,
    );
    const askedByPull = cycleWith(
      async () => FAILED,
      async () => ({ kind: "failed", retryAfterMs: 30_000 }),
    );

    expect(await asked.cycle()).toEqual({ kind: "failed", retryAfterMs: 45_000 });
    expect(await askedByPull.cycle()).toEqual({ kind: "failed", retryAfterMs: 30_000 });
  });

  it("waits as long as the longer of the two waits the cloud asked", async () => {
    const { cycle } = cycleWith(
      async () => ({ kind: "failed", retryAfterMs: 45_000 }),
      async () => ({ kind: "failed", retryAfterMs: 30_000 }),
    );

    expect(await cycle()).toEqual({ kind: "failed", retryAfterMs: 45_000 });
  });
});

describe("the sync schedule running sync cycles", () => {
  it("keeps pulling on every cycle while the push keeps failing or throwing", async () => {
    let pushes = 0;
    let pulls = 0;
    const timers: (() => void)[] = [];
    const schedule = createSyncSchedule({
      syncOnce: () =>
        runSyncCycle({
          checkInstallation: async () => SUCCEEDED,
          push: async () => {
            pushes += 1;
            if (pushes === 1) {
              throw new Error("disk full");
            }
            return FAILED;
          },
          pull: async () => {
            pulls += 1;
            return SUCCEEDED;
          },
          onPushFailure: () => {},
          onCheckFailure: () => {},
        }),
      intervalMs: 30_000,
      failureBackoff: { baseMs: 2000, maxMs: 60_000 },
      random: () => 1,
      scheduleNext: (run) => {
        timers.push(run);
        return () => {};
      },
      onFailure: () => {},
      afterEachSync: () => {},
    });

    schedule.start();
    await settle();
    timers.at(-1)?.();
    await settle();
    timers.at(-1)?.();
    await settle();

    expect({ pushes, pulls }).toEqual({ pushes: 3, pulls: 3 });
  });
});

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
}
