import { describe, expect, it } from "vitest";
import { createPullSchedule, type PullResult } from "./pull-schedule";

interface Scheduled {
  run: () => void;
  delayMs: number;
  cancelled: boolean;
}

const SUCCEEDED: PullResult = { kind: "succeeded" };
const FAILED: PullResult = { kind: "failed" };

function scheduleWith(pullOnce: () => Promise<PullResult>, random: () => number = () => 1) {
  const timers: Scheduled[] = [];
  const failures: unknown[] = [];
  const schedule = createPullSchedule({
    pullOnce,
    intervalMs: 30_000,
    failureBackoff: { baseMs: 2000, maxMs: 60_000 },
    random,
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
      return SUCCEEDED;
    });

    schedule.start();
    await settle();

    expect(pulls).toBe(1);
    expect(pending().map((timer) => timer.delayMs)).toEqual([30_000]);

    await fireNext();
    expect(pulls).toBe(2);
    expect(pending().map((timer) => timer.delayMs)).toEqual([30_000]);
  });

  it("keeps pulling after a pull throws, reporting the failure", async () => {
    let pulls = 0;
    const { schedule, pending, fireNext, failures } = scheduleWith(async () => {
      pulls += 1;
      if (pulls === 1) {
        throw new Error("disk full");
      }
      return SUCCEEDED;
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
      return SUCCEEDED;
    });
    schedule.start();
    await settle();

    schedule.pullNow();
    await settle();

    expect(pulls).toBe(2);
    expect(pending().map((timer) => timer.delayMs)).toEqual([30_000]);
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
      return SUCCEEDED;
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

  it("waits longer after each failure, up to a cap, and pulls at the usual interval again after a success", async () => {
    const results: PullResult[] = [FAILED, FAILED, FAILED, FAILED, FAILED, FAILED, SUCCEEDED];
    const { schedule, pending, fireNext } = scheduleWith(async () => results.shift() ?? SUCCEEDED);
    const waits: number[] = [];

    schedule.start();
    await settle();
    for (let pull = 1; pull < 7; pull += 1) {
      waits.push(...pending().map((timer) => timer.delayMs));
      await fireNext();
    }
    waits.push(...pending().map((timer) => timer.delayMs));

    expect(waits).toEqual([2000, 4000, 8000, 16_000, 32_000, 60_000, 30_000]);
  });

  it("spreads each retry between half its wait and all of it", async () => {
    const early = scheduleWith(
      async () => FAILED,
      () => 0,
    );
    early.schedule.start();
    await settle();
    const late = scheduleWith(
      async () => FAILED,
      () => 0.5,
    );
    late.schedule.start();
    await settle();

    expect(early.pending().map((timer) => timer.delayMs)).toEqual([1000]);
    expect(late.pending().map((timer) => timer.delayMs)).toEqual([1500]);
  });

  it("also backs off when a pull throws", async () => {
    const { schedule, pending } = scheduleWith(async () => {
      throw new Error("disk full");
    });

    schedule.start();
    await settle();

    expect(pending().map((timer) => timer.delayMs)).toEqual([2000]);
  });

  it("waits as long as the cloud asked, even beyond the cap, instead of backing off", async () => {
    const { schedule, pending } = scheduleWith(async () => ({
      kind: "failed",
      retryAfterMs: 120_000,
    }));

    schedule.start();
    await settle();

    expect(pending().map((timer) => timer.delayMs)).toEqual([120_000]);
  });

  it("keeps the wait the cloud asked for when a pull is requested meanwhile", async () => {
    let pulls = 0;
    const { schedule, pending } = scheduleWith(async () => {
      pulls += 1;
      return { kind: "failed", retryAfterMs: 20_000 };
    });
    schedule.start();
    await settle();

    schedule.pullNow();
    await settle();

    expect(pulls).toBe(1);
    expect(pending().map((timer) => timer.delayMs)).toEqual([20_000]);
  });

  it("does not pull again after a rate-limited pull that was asked again meanwhile", async () => {
    let pulls = 0;
    const releases: (() => void)[] = [];
    const { schedule, pending } = scheduleWith(async () => {
      pulls += 1;
      await new Promise<void>((resolve) => releases.push(resolve));
      return { kind: "failed", retryAfterMs: 20_000 };
    });
    schedule.start();
    await settle();
    schedule.pullNow();

    releases.shift()?.();
    await settle();

    expect(pulls).toBe(1);
    expect(pending().map((timer) => timer.delayMs)).toEqual([20_000]);
  });

  it("pulls right away when asked during a backoff", async () => {
    let pulls = 0;
    const { schedule, pending } = scheduleWith(async () => {
      pulls += 1;
      return pulls === 1 ? FAILED : SUCCEEDED;
    });
    schedule.start();
    await settle();

    schedule.pullNow();
    await settle();

    expect(pulls).toBe(2);
    expect(pending().map((timer) => timer.delayMs)).toEqual([30_000]);
  });
});
