import { describe, expect, it, vi } from "vitest";
import { criticalBatteryActionOutput } from "./test-support/critical-battery-action-output";
import { windowsCriticalBatteryActionReader } from "./windows-critical-battery-action-reader";

function readerPrinting(stdout: string, platform: NodeJS.Platform = "win32") {
  const run = vi.fn(async (_file: string, _args: readonly string[], _options: object) => ({
    stdout,
  }));
  const onFailure = vi.fn();
  return {
    run,
    onFailure,
    reader: windowsCriticalBatteryActionReader({ run, platform, onFailure }),
  };
}

describe("the Windows critical-battery action reader", () => {
  it("cannot read the action off Windows, and runs nothing", async () => {
    const { run, reader } = readerPrinting(criticalBatteryActionOutput([3]), "linux");

    expect(await reader.read()).toEqual({ kind: "unreadable" });
    expect(run).not.toHaveBeenCalled();
  });

  it("asks PowerShell, without a profile or prompt, in a hidden window and with a timeout", async () => {
    const { run, reader } = readerPrinting(criticalBatteryActionOutput([3]));

    await reader.read();

    expect(run).toHaveBeenCalledWith(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", expect.any(String)],
      { timeout: 10_000, windowsHide: true },
    );
  });

  it("reads the on-battery value of the active power plan's critical battery action by its identifiers, not by any display name", async () => {
    const { run, reader } = readerPrinting(criticalBatteryActionOutput([3]));

    await reader.read();

    const script = String(run.mock.calls[0]?.[1]?.[3]);
    expect(script).toContain("Win32_PowerPlan");
    expect(script).toContain('-Filter "IsActive=TRUE"');
    expect(script).toContain("Win32_PowerSettingDataIndex");
    expect(script).toContain("\\DC\\");
    expect(script).toContain("637ea02f-bbcb-4015-8e2c-a1c7b9c0b546");
    expect(script).toContain("SettingIndexValue");
  });

  it.each([
    [0, "do_nothing"],
    [1, "sleep"],
    [2, "hibernate"],
    [3, "shut_down"],
  ] as const)("reads the value %i as %s", async (value, action) => {
    const { reader } = readerPrinting(criticalBatteryActionOutput([value]));

    expect(await reader.read()).toEqual({ kind: "read", action });
  });

  it.each([
    ["no value for the active plan", criticalBatteryActionOutput([])],
    ["an unknown value", criticalBatteryActionOutput([4])],
    ["a missing value", criticalBatteryActionOutput([null])],
    ["two different values", criticalBatteryActionOutput([1, 3])],
    ["output that is not JSON", "not json"],
    ["output of another shape", '{"batteries":[]}'],
  ])("cannot tell the action from %s", async (_name, stdout) => {
    const { reader } = readerPrinting(stdout);

    expect(await reader.read()).toEqual({ kind: "unreadable" });
  });

  it("reads the action when the plan lists the same value twice", async () => {
    const { reader } = readerPrinting(criticalBatteryActionOutput([2, 2]));

    expect(await reader.read()).toEqual({ kind: "read", action: "hibernate" });
  });

  it("cannot tell the action when PowerShell fails, and reports why", async () => {
    const failure = new Error("powershell timed out");
    const onFailure = vi.fn();
    const reader = windowsCriticalBatteryActionReader({
      run: async () => {
        throw failure;
      },
      platform: "win32",
      onFailure,
    });

    expect(await reader.read()).toEqual({ kind: "unreadable" });
    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  it("reports an output it cannot understand", async () => {
    const { reader, onFailure } = readerPrinting("not json");

    await reader.read();

    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("does not report a read that worked, nor one off Windows", async () => {
    const worked = readerPrinting(criticalBatteryActionOutput([3]));
    const offWindows = readerPrinting(criticalBatteryActionOutput([3]), "linux");

    await worked.reader.read();
    await offWindows.reader.read();

    expect(worked.onFailure).not.toHaveBeenCalled();
    expect(offWindows.onFailure).not.toHaveBeenCalled();
  });

  it("cannot tell the action when PowerShell fails and nobody listens for failures", async () => {
    const reader = windowsCriticalBatteryActionReader({
      run: async () => {
        throw new Error("boom");
      },
      platform: "win32",
    });

    expect(await reader.read()).toEqual({ kind: "unreadable" });
  });
});
