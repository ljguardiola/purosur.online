import { describe, expect, it } from "vitest";
import {
  CRITICAL_BATTERY_ACTIONS,
  type CriticalBatteryAction,
  criticalBatteryActionShowsCondition,
} from "./critical-battery-action.js";

describe("CRITICAL_BATTERY_ACTIONS", () => {
  it("lists what Windows can do at critical battery, in the order of its numeric setting", () => {
    expect(CRITICAL_BATTERY_ACTIONS).toEqual(["do_nothing", "sleep", "hibernate", "shut_down"]);
  });
});

describe("criticalBatteryActionShowsCondition", () => {
  it("shows nothing when the action could not be read", () => {
    expect(criticalBatteryActionShowsCondition({ kind: "unreadable" })).toBe(false);
  });

  it("shows nothing when Windows shuts the notebook down", () => {
    expect(criticalBatteryActionShowsCondition({ kind: "read", action: "shut_down" })).toBe(false);
  });

  it("shows the condition for every other action", () => {
    for (const action of ["do_nothing", "sleep", "hibernate"] as const) {
      const read: CriticalBatteryAction = { kind: "read", action };
      expect(criticalBatteryActionShowsCondition(read)).toBe(true);
    }
  });
});
