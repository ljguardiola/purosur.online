import { describe, expect, it } from "vitest";
import { createPullSchedule } from "./pull-schedule";

interface Scheduled {
  run: () => void;
  delayMs: number;
  cancelled: boolean;
}

function scheduleWith(pullOnce: () => Promise<void>) {
  const timers: Scheduled[] = [];
  const failures: unknown[] = [];
  const schedule = createPullSchedule({
    pullOnce,
    intervalMs: 60_000,
    scheduleNext: (run, delayMs) => {
      const timer = { run, delayMs, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    onFailure: (error) => failures.push(error),
  });
  const pending = () => timers.filter((timer) => !timer.cancelled);
  const fireNext = async () => {
    const [next] = pending();
    if (next === undefined) {
      throw new Error("test setup: nothing is scheduled");
    }
    next.cancelled = true;
    next.run();
    await settle();
  };
  return { schedule, timers, pending, fireNext, failures };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

describe("the pull schedule", () => {
  it("pulls as soon as it starts, then again every interval", async () => {
    let pulls = 0;
    const { schedule, pending, fireNext } = scheduleWith(async () => {
      pulls += 1;
    });

    schedule.start();
    await settle();

    expect(pulls).toBe(1);
    expect(pending().map((timer) => timer.delayMs)).toEqual([60_000]);

    await fireNext();
    expect(pulls).toBe(2);
    expect(pending().map((timer) => timer.delayMs)).toEqual([60_000]);
  });

  it("keeps pulling on schedule after a pull fails, reporting the failure", async () => {
    let pulls = 0;
    const { schedule, pending, fireNext, failures } = scheduleWith(async () => {
      pulls += 1;
      if (pulls === 1) {
        throw new Error("disk full");
      }
    });

    schedule.start();
    await settle();

    expect(failures).toEqual([new Error("disk full")]);
    expect(pending()).toHaveLength(1);
    await fireNext();
    expect(pulls).toBe(2);
  });

  it("pulls right away when asked, in place of the scheduled pull", async () => {
    let pulls = 0;
    const { schedule, pending } = scheduleWith(async () => {
      pulls += 1;
    });
    schedule.start();
    await settle();

    schedule.pullNow();
    await settle();

    expect(pulls).toBe(2);
    expect(pending().map((timer) => timer.delayMs)).toEqual([60_000]);
  });

  it("never runs two pulls at once, pulling once more after the running one when asked meanwhile", async () => {
    let pulls = 0;
    let running = 0;
    let mostAtOnce = 0;
    const releases: (() => void)[] = [];
    const { schedule } = scheduleWith(async () => {
      pulls += 1;
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running -= 1;
    });

    schedule.start();
    await settle();
    schedule.pullNow();
    schedule.pullNow();
    await settle();

    expect(pulls).toBe(1);
    releases.shift()?.();
    await settle();
    expect(pulls).toBe(2);
    releases.shift()?.();
    await settle();
    expect(pulls).toBe(2);
    expect(mostAtOnce).toBe(1);
  });
});
