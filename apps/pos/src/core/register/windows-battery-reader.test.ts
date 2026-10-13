import { describe, expect, it, vi } from "vitest";
import {
  batteryOutput,
  CHARGING_ON_MAINS_OUTPUT,
  DISCHARGING_BATTERY_OUTPUT,
  HEALTH_UNAVAILABLE_OUTPUT,
  NO_BATTERY_OUTPUT,
  TWO_BATTERIES_OUTPUT,
} from "./test-support/battery-powershell-output";
import { windowsBatteryReader } from "./windows-battery-reader";

function readerPrinting(stdout: string, platform: NodeJS.Platform = "win32") {
  const run = vi.fn(async () => ({ stdout }));
  return { run, reader: windowsBatteryReader({ run, platform }) };
}

function readerFailing(failure: unknown) {
  return windowsBatteryReader({
    run: async () => {
      throw failure;
    },
    platform: "win32",
  });
}

describe("the Windows battery reader", () => {
  it("cannot read the battery off Windows, and runs nothing", async () => {
    const { run, reader } = readerPrinting(DISCHARGING_BATTERY_OUTPUT, "linux");

    expect(await reader.read()).toEqual({ kind: "unreadable" });
    expect(run).not.toHaveBeenCalled();
  });

  it("asks PowerShell, without a profile or prompt, in a hidden window and with a timeout", async () => {
    const { run, reader } = readerPrinting(DISCHARGING_BATTERY_OUTPUT);

    await reader.read();

    expect(run).toHaveBeenCalledWith(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", expect.stringContaining("Win32_Battery")],
      { timeout: 10_000, windowsHide: true },
    );
  });

  it("reads the capacities from the WMI namespace without failing when it is unavailable", async () => {
    const { run, reader } = readerPrinting(DISCHARGING_BATTERY_OUTPUT);

    await reader.read();

    const script = String(run.mock.calls[0]?.[1]?.[3]);
    expect(script).toContain("BatteryFullChargedCapacity");
    expect(script).toContain("BatteryStaticData");
    expect(script).toContain("SilentlyContinue");
  });

  it("reports a battery that is discharging with its charge and health", async () => {
    expect(await readerPrinting(DISCHARGING_BATTERY_OUTPUT).reader.read()).toEqual({
      kind: "present",
      chargePercent: 72,
      healthPercent: 90,
      onBattery: true,
    });
  });

  it("reports a battery charging on mains power as not running on battery", async () => {
    expect(await readerPrinting(CHARGING_ON_MAINS_OUTPUT).reader.read()).toEqual({
      kind: "present",
      chargePercent: 55,
      healthPercent: 90,
      onBattery: false,
    });
  });

  it("reports an absent battery when Windows lists none", async () => {
    expect(await readerPrinting(NO_BATTERY_OUTPUT).reader.read()).toEqual({ kind: "absent" });
  });

  it("still reports the charge when the capacities are unavailable, leaving the health out", async () => {
    const reading = await readerPrinting(HEALTH_UNAVAILABLE_OUTPUT).reader.read();

    expect(reading).toEqual({ kind: "present", chargePercent: 90, onBattery: true });
    expect(reading).not.toHaveProperty("healthPercent");
  });

  it("averages the charge of two batteries, adds their capacities and is on battery if either is", async () => {
    expect(await readerPrinting(TWO_BATTERIES_OUTPUT).reader.read()).toEqual({
      kind: "present",
      chargePercent: 61,
      healthPercent: 62,
      onBattery: true,
    });
  });

  it.each([
    [1, true],
    [2, false],
    [3, false],
    [4, true],
    [5, true],
    [6, false],
    [11, false],
  ])("treats Windows battery status %i as on battery: %s", async (status, onBattery) => {
    const output = batteryOutput([{ EstimatedChargeRemaining: 50, BatteryStatus: status }]);

    expect(await readerPrinting(output).reader.read()).toMatchObject({
      kind: "present",
      onBattery,
    });
  });

  it("does not take a battery with no known status as running on battery", async () => {
    const output = batteryOutput([{ EstimatedChargeRemaining: 50, BatteryStatus: null }]);

    expect(await readerPrinting(output).reader.read()).toMatchObject({ onBattery: false });
  });

  it("keeps a charge Windows reports above 100 within 100", async () => {
    const output = batteryOutput([{ EstimatedChargeRemaining: 120, BatteryStatus: 2 }]);

    expect(await readerPrinting(output).reader.read()).toMatchObject({ chargePercent: 100 });
  });

  it("averages only the batteries that report a charge", async () => {
    const output = batteryOutput([
      { EstimatedChargeRemaining: 40, BatteryStatus: 1 },
      { EstimatedChargeRemaining: null, BatteryStatus: 1 },
    ]);

    expect(await readerPrinting(output).reader.read()).toMatchObject({ chargePercent: 40 });
  });

  it("cannot read a battery none of whose charges Windows reports", async () => {
    const output = batteryOutput([{ EstimatedChargeRemaining: null, BatteryStatus: 1 }]);

    expect(await readerPrinting(output).reader.read()).toEqual({ kind: "unreadable" });
  });

  it("leaves the health out when the design capacity is zero", async () => {
    const output = JSON.stringify({
      batteries: [{ EstimatedChargeRemaining: 50, BatteryStatus: 2 }],
      fullCharge: [{ FullChargedCapacity: 100 }],
      design: [{ DesignedCapacity: 0 }],
    });

    expect(await readerPrinting(output).reader.read()).not.toHaveProperty("healthPercent");
  });

  it.each([
    ["is not JSON", "Get-CimInstance : Access denied"],
    ["is empty", ""],
    ["is not an object", "[]"],
    ["has no batteries list", '{"fullCharge":[],"design":[]}'],
    [
      "has a charge that is not a number",
      batteryOutput([{ EstimatedChargeRemaining: "x" as never, BatteryStatus: 1 }]),
    ],
  ])("cannot read the battery when what PowerShell printed %s", async (_name, stdout) => {
    expect(await readerPrinting(stdout).reader.read()).toEqual({ kind: "unreadable" });
  });

  it.each([
    ["the command fails or times out", new Error("Command failed: powershell.exe")],
    [
      "PowerShell is missing",
      Object.assign(new Error("spawn powershell.exe ENOENT"), { code: "ENOENT" }),
    ],
  ])("cannot read the battery when %s", async (_name, failure) => {
    expect(await readerFailing(failure).read()).toEqual({ kind: "unreadable" });
  });
});
