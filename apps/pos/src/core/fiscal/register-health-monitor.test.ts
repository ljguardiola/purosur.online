import { REGISTER_HEALTH_CHECK_INTERVAL_MS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { startRegisterHealthMonitor } from "./register-health-monitor";

function monitorWith(check: () => Promise<unknown>) {
  const scheduled: { run: () => void; delayMs: number; cancelled: boolean }[] = [];
  const failures: unknown[] = [];
  const stop = startRegisterHealthMonitor({
    check,
    scheduleNext: (run, delayMs) => {
      const entry = { run, delayMs, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    onFailure: (error) => failures.push(error),
  });
  return { scheduled, failures, stop };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("the register's health monitor", () => {
  it("checks at once and then every interval, after the previous check ended", async () => {
    let checks = 0;
    const { scheduled } = monitorWith(async () => {
      checks += 1;
    });
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([0]);

    scheduled[0]?.run();
    await settle();
    expect(checks).toBe(1);
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([0, REGISTER_HEALTH_CHECK_INTERVAL_MS]);

    scheduled[1]?.run();
    await settle();
    expect(checks).toBe(2);
    expect(scheduled).toHaveLength(3);
  });

  it("schedules the next check only once the running one ended", async () => {
    let finish: () => void = () => undefined;
    const { scheduled } = monitorWith(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    scheduled[0]?.run();
    await settle();
    expect(scheduled).toHaveLength(1);

    finish();
    await settle();
    expect(scheduled).toHaveLength(2);
  });

  it("reports a failed check and keeps checking", async () => {
    const failure = new Error("the database is locked");
    const { scheduled, failures } = monitorWith(async () => {
      throw failure;
    });

    scheduled[0]?.run();
    await settle();

    expect(failures).toEqual([failure]);
    expect(scheduled).toHaveLength(2);
  });

  it("stops checking when stopped", async () => {
    const { scheduled, stop } = monitorWith(async () => undefined);
    scheduled[0]?.run();
    await settle();

    stop();

    expect(scheduled[1]?.cancelled).toBe(true);
  });

  it("schedules nothing more once stopped while a check runs", async () => {
    let finish: () => void = () => undefined;
    const { scheduled, stop } = monitorWith(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    scheduled[0]?.run();
    await settle();

    stop();
    finish();
    await settle();

    expect(scheduled).toHaveLength(1);
  });
});
