import { describe, expect, it } from "vitest";
import { startDeviceTokenRotationSchedule } from "./device-token-rotation-schedule";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function scheduleWithFakeTimer(rotate: () => Promise<unknown> = async () => undefined) {
  const scheduled: { run: () => Promise<void>; delayMs: number; cancelled: boolean }[] = [];
  const stop = startDeviceTokenRotationSchedule({
    rotate,
    schedule: (run, delayMs) => {
      const timer = { run, delayMs, cancelled: false };
      scheduled.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  async function fireLatest(): Promise<void> {
    await scheduled.at(-1)?.run();
  }
  return { scheduled, stop, fireLatest };
}

describe("startDeviceTokenRotationSchedule", () => {
  it("checks right after starting, without running anything yet", () => {
    let rotations = 0;
    const { scheduled } = scheduleWithFakeTimer(async () => {
      rotations += 1;
    });

    expect(scheduled.map((timer) => timer.delayMs)).toEqual([0]);
    expect(rotations).toBe(0);
  });

  it("checks again a quarter of an hour after each check, whatever it found", async () => {
    let rotations = 0;
    const { scheduled, fireLatest } = scheduleWithFakeTimer(async () => {
      rotations += 1;
    });

    await fireLatest();
    await fireLatest();

    expect(rotations).toBe(2);
    expect(scheduled.map((timer) => timer.delayMs)).toEqual([
      0,
      CHECK_INTERVAL_MS,
      CHECK_INTERVAL_MS,
    ]);
  });

  it("schedules the next check only once the running one has finished", async () => {
    let finish: () => void = () => undefined;
    const { scheduled } = scheduleWithFakeTimer(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(undefined);
        }),
    );

    const running = scheduled[0]?.run();
    expect(scheduled).toHaveLength(1);

    finish();
    await running;
    expect(scheduled).toHaveLength(2);
  });

  it("keeps checking after a check that failed", async () => {
    const { scheduled } = scheduleWithFakeTimer(async () => {
      throw new Error("main didn't answer");
    });

    await scheduled[0]?.run();

    expect(scheduled.map((timer) => timer.delayMs)).toEqual([0, CHECK_INTERVAL_MS]);
  });

  it("cancels the pending check when stopped", () => {
    const { scheduled, stop } = scheduleWithFakeTimer();

    stop();

    expect(scheduled.map((timer) => timer.cancelled)).toEqual([true]);
  });

  it("schedules nothing more when stopped while a check is running", async () => {
    let finish: () => void = () => undefined;
    const { scheduled, stop } = scheduleWithFakeTimer(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(undefined);
        }),
    );

    const running = scheduled[0]?.run();
    stop();
    finish();
    await running;

    expect(scheduled).toHaveLength(1);
  });
});
