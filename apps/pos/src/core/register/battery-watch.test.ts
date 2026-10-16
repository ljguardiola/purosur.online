import type { BatteryReading } from "@purosur/domain";
import { describe, expect, it, vi } from "vitest";
import { createBatteryWatch } from "./battery-watch";

const INTERVAL_MS = 60_000;
const START = new Date("2026-10-13T12:00:00.000Z");

const ON_BATTERY: BatteryReading = {
  kind: "present",
  chargePercent: 70,
  healthPercent: 91,
  onBattery: true,
};
const ON_MAINS: BatteryReading = { kind: "present", chargePercent: 71, onBattery: false };

function setup(first: BatteryReading | Error = ON_MAINS) {
  const world = { reading: first, now: START };
  const pending: { run: () => Promise<void>; delayMs: number; cancelled: boolean }[] = [];
  const onFailure = vi.fn();
  const onChange = vi.fn();
  const read = vi.fn(async () => {
    if (world.reading instanceof Error) {
      throw world.reading;
    }
    return world.reading;
  });
  const watch = createBatteryWatch({
    reader: { read },
    intervalMs: INTERVAL_MS,
    scheduleNext: (run, delayMs) => {
      const entry = { run, delayMs, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    clock: { now: () => world.now },
    onFailure,
    onChange,
  });
  const nextRead = () => pending.filter((entry) => !entry.cancelled).at(-1);
  async function advance(minutes: number, reading?: BatteryReading | Error): Promise<void> {
    world.now = new Date(world.now.getTime() + minutes * 60_000);
    if (reading !== undefined) {
      world.reading = reading;
    }
    const entry = nextRead();
    if (entry === undefined) {
      throw new Error("no read is scheduled");
    }
    entry.cancelled = true;
    await entry.run();
  }
  return { world, watch, read, onFailure, onChange, nextRead, advance };
}

describe("watching the register's battery", () => {
  it("reports nothing before the first read has finished", () => {
    const { watch, read } = setup();

    expect(watch.report()).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it("reads as soon as it starts", async () => {
    const { watch } = setup();

    await watch.start();

    expect(watch.report()).toEqual({
      present: true,
      charge_percent: 71,
      on_battery: false,
      on_battery_minutes: 0,
    });
  });

  it("reads again after the interval, once the previous read has finished", async () => {
    const { watch, nextRead, advance } = setup();
    await watch.start();
    expect(nextRead()?.delayMs).toBe(INTERVAL_MS);

    await advance(1, { kind: "present", chargePercent: 50, onBattery: false });

    expect(watch.report()).toMatchObject({ charge_percent: 50 });
    expect(nextRead()?.delayMs).toBe(INTERVAL_MS);
  });

  it("counts the minutes in a row on battery from the first read on battery", async () => {
    const { watch, advance } = setup(ON_BATTERY);
    await watch.start();

    await advance(1);
    await advance(1);

    expect(watch.report()).toMatchObject({ on_battery: true, on_battery_minutes: 2 });
  });

  it("counts the minutes up to the moment of the report, not of the last read", async () => {
    const { watch, world } = setup(ON_BATTERY);
    await watch.start();

    world.now = new Date(START.getTime() + 3 * 60_000 + 30_000);

    expect(watch.report()).toMatchObject({ on_battery_minutes: 3 });
  });

  it("starts counting again after the register went back to mains power", async () => {
    const { watch, advance } = setup(ON_BATTERY);
    await watch.start();
    await advance(5, ON_MAINS);
    expect(watch.report()).toMatchObject({ on_battery: false, on_battery_minutes: 0 });

    await advance(1, ON_BATTERY);
    await advance(2);

    expect(watch.report()).toMatchObject({ on_battery_minutes: 2 });
  });

  it("keeps counting across a read that could not find out", async () => {
    const { watch, advance } = setup(ON_BATTERY);
    await watch.start();

    await advance(1, { kind: "unreadable" });
    expect(watch.report()).toBeUndefined();

    await advance(1, ON_BATTERY);
    expect(watch.report()).toMatchObject({ on_battery_minutes: 2 });
  });

  it("reports nothing while the battery cannot be read, not that it has none", async () => {
    const { watch } = setup({ kind: "unreadable" });

    await watch.start();

    expect(watch.report()).toBeUndefined();
  });

  it("reports that there is no battery once Windows lists none", async () => {
    const { watch } = setup({ kind: "absent" });

    await watch.start();

    expect(watch.report()).toEqual({ present: false });
  });

  it("treats a reader that throws as unreadable, reports the failure once and keeps reading", async () => {
    const failure = new Error("boom");
    const { watch, onFailure, nextRead, advance } = setup(failure);

    await watch.start();
    await advance(1);

    expect(watch.report()).toBeUndefined();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(failure);
    expect(nextRead()).toBeDefined();
  });

  it("reports a new failure after a read that worked", async () => {
    const { onFailure, watch, advance } = setup(new Error("first"));
    await watch.start();

    await advance(1, ON_MAINS);
    expect(watch.report()).toMatchObject({ present: true, charge_percent: 71 });
    await advance(1, new Error("second"));

    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(watch.report()).toBeUndefined();
  });

  it("keeps reading when a failing reader has no failure handler to tell", async () => {
    const watch = createBatteryWatch({
      reader: {
        read: async () => {
          throw new Error("boom");
        },
      },
      intervalMs: INTERVAL_MS,
      scheduleNext: () => () => {},
      clock: { now: () => START },
    });

    await expect(watch.start()).resolves.toBeUndefined();
    expect(watch.report()).toBeUndefined();
  });

  describe("telling the conditions it drives changed", () => {
    const LOW: BatteryReading = { kind: "present", chargePercent: 19, onBattery: true };
    const CRITICAL: BatteryReading = { kind: "present", chargePercent: 9, onBattery: true };

    it("says nothing while a register on mains power reads as normal", async () => {
      const { watch, advance, onChange } = setup(ON_MAINS);

      await watch.start();
      await advance(1, { kind: "present", chargePercent: 40, onBattery: false });

      expect(onChange).not.toHaveBeenCalled();
    });

    it("says nothing while the battery cannot be read", async () => {
      const { watch, advance, onChange } = setup({ kind: "unreadable" });

      await watch.start();
      await advance(1);

      expect(onChange).not.toHaveBeenCalled();
    });

    it("says so when the first read already finds a condition", async () => {
      const { watch, onChange } = setup(LOW);

      await watch.start();

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("says so when the charge drops from normal to low and from low to critical, and when it recovers", async () => {
      const { watch, advance, onChange } = setup(ON_BATTERY);
      await watch.start();
      expect(onChange).not.toHaveBeenCalled();

      await advance(1, LOW);
      expect(onChange).toHaveBeenCalledTimes(1);

      await advance(1, CRITICAL);
      expect(onChange).toHaveBeenCalledTimes(2);

      await advance(1, ON_MAINS);
      expect(onChange).toHaveBeenCalledTimes(3);
    });

    it("says so when the charge changes while it is low, because the condition names it", async () => {
      const { watch, advance, onChange } = setup(LOW);
      await watch.start();

      await advance(1, { kind: "present", chargePercent: 18, onBattery: true });

      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("says nothing while a read repeats what the last one found", async () => {
      const { watch, advance, onChange } = setup(CRITICAL);
      await watch.start();

      await advance(1);
      await advance(1, { kind: "present", chargePercent: 5, onBattery: true });

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("says so once the register has been on battery for ten whole minutes, and when it goes back to mains power", async () => {
      const { watch, advance, onChange } = setup(ON_BATTERY);
      await watch.start();

      await advance(9.5);
      expect(onChange).not.toHaveBeenCalled();
      await advance(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(onChange).toHaveBeenCalledTimes(1);

      await advance(1, ON_MAINS);
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("says so when Windows lists no battery, and when one comes back", async () => {
      const { watch, advance, onChange } = setup({ kind: "absent" });

      await watch.start();
      expect(onChange).toHaveBeenCalledTimes(1);

      await advance(1, ON_MAINS);
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("says so when a battery it could read can no longer be read", async () => {
      const { watch, advance, onChange } = setup(CRITICAL);
      await watch.start();

      await advance(1, new Error("boom"));

      expect(onChange).toHaveBeenCalledTimes(2);
    });
  });
});
