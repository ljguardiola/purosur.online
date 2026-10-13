import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BATTERY_READ_INTERVAL_MS,
  type BatteryReading,
  batteryHealthPercent,
  batteryReportOf,
  nextOnBatterySince,
} from "./battery.js";

const onBattery: BatteryReading = { kind: "present", chargePercent: 80, onBattery: true };
const onAc: BatteryReading = { kind: "present", chargePercent: 80, onBattery: false };
const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 10, minute));

describe("BATTERY_READ_INTERVAL_MS", () => {
  it("is one minute", () => {
    expect(BATTERY_READ_INTERVAL_MS).toBe(60_000);
  });
});

describe("batteryHealthPercent", () => {
  it("is the full-charge capacity as a whole percentage of the design capacity", () => {
    expect(batteryHealthPercent(4500, 5000)).toBe(90);
  });

  it("rounds down so a pack just under a threshold stays under it", () => {
    expect(batteryHealthPercent(2980, 5000)).toBe(59);
  });

  it("allows a new pack above its design capacity", () => {
    expect(batteryHealthPercent(5500, 5000)).toBe(110);
  });

  it("is unknown when the design capacity is not positive", () => {
    expect(batteryHealthPercent(100, 0)).toBeUndefined();
    expect(batteryHealthPercent(100, -5)).toBeUndefined();
  });

  it("does not lose a whole percent to floating-point error", () => {
    expect(batteryHealthPercent(29, 100)).toBe(29);
    expect(batteryHealthPercent(58, 100)).toBe(58);
  });

  it("is the exact whole percentage rounded down for every capacity", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (full, design) => batteryHealthPercent(full, design) === Math.floor((full * 100) / design),
      ),
    );
  });
});

describe("nextOnBatterySince", () => {
  it("starts at the first reading on battery", () => {
    expect(nextOnBatterySince(undefined, onBattery, at(5))).toEqual(at(5));
  });

  it("keeps the earlier start while still on battery", () => {
    expect(nextOnBatterySince(at(1), onBattery, at(5))).toEqual(at(1));
  });

  it("resets on a reading on mains power", () => {
    expect(nextOnBatterySince(at(1), onAc, at(5))).toBeUndefined();
  });

  it("resets when there is no battery", () => {
    expect(nextOnBatterySince(at(1), { kind: "absent" }, at(5))).toBeUndefined();
  });

  it("leaves the streak unchanged when the battery cannot be read", () => {
    expect(nextOnBatterySince(at(1), { kind: "unreadable" }, at(5))).toEqual(at(1));
    expect(nextOnBatterySince(undefined, { kind: "unreadable" }, at(5))).toBeUndefined();
  });

  it("stays unset on mains power with no streak", () => {
    expect(nextOnBatterySince(undefined, onAc, at(5))).toBeUndefined();
  });
});

describe("batteryReportOf", () => {
  it("reports nothing for an unreadable battery", () => {
    expect(batteryReportOf({ kind: "unreadable" }, at(1), at(9))).toBeUndefined();
  });

  it("reports an absent battery as not present", () => {
    expect(batteryReportOf({ kind: "absent" }, undefined, at(9))).toEqual({ present: false });
  });

  it("reports charge, health and the whole minutes on battery", () => {
    expect(
      batteryReportOf(
        { kind: "present", chargePercent: 42, healthPercent: 88, onBattery: true },
        at(1),
        new Date(at(8).getTime() + 59_000),
      ),
    ).toEqual({
      present: true,
      charge_percent: 42,
      health_percent: 88,
      on_battery: true,
      on_battery_minutes: 7,
    });
  });

  it("omits the health when it is unknown", () => {
    const report = batteryReportOf(onAc, undefined, at(9));
    expect(report).toEqual({
      present: true,
      charge_percent: 80,
      on_battery: false,
      on_battery_minutes: 0,
    });
    expect(report).not.toHaveProperty("health_percent");
  });

  it("reports zero minutes on mains power even with an earlier streak", () => {
    expect(batteryReportOf(onAc, at(1), at(9))).toMatchObject({ on_battery_minutes: 0 });
  });

  it("reports zero minutes when on battery without a recorded start", () => {
    expect(batteryReportOf(onBattery, undefined, at(9))).toMatchObject({ on_battery_minutes: 0 });
  });

  it("counts whole minutes since the start for every elapsed time", () => {
    fc.assert(
      fc.property(fc.nat({ max: 10_000_000 }), (elapsedMs) => {
        const since = at(0);
        const report = batteryReportOf(onBattery, since, new Date(since.getTime() + elapsedMs));
        return (
          report?.present === true && report.on_battery_minutes === Math.floor(elapsedMs / 60_000)
        );
      }),
    );
  });
});
