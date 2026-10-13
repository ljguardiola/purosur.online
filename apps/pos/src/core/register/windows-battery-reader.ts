import type { BatteryReading } from "@purosur/domain";
import { batteryHealthPercent } from "@purosur/domain";
import { z } from "zod";
import type { BatteryReader } from "./battery-reader";

const POWERSHELL_TIMEOUT_MS = 10_000;

// Win32_Battery.BatteryStatus: 1 discharging, 4 low, 5 critical. 2 is on mains power.
const STATUSES_ON_BATTERY = new Set([1, 4, 5]);

const BATTERY_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$batteries = @(Get-CimInstance -ClassName Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus)",
  "$fullCharge = @(Get-CimInstance -Namespace root/wmi -ClassName BatteryFullChargedCapacity -ErrorAction SilentlyContinue | Select-Object InstanceName, FullChargedCapacity)",
  "$design = @(Get-CimInstance -Namespace root/wmi -ClassName BatteryStaticData -ErrorAction SilentlyContinue | Select-Object InstanceName, DesignedCapacity)",
  "[pscustomobject]@{ batteries = $batteries; fullCharge = $fullCharge; design = $design } | ConvertTo-Json -Compress -Depth 4",
].join("; ");

const powershellOutputSchema = z.object({
  batteries: z.array(
    z.object({
      EstimatedChargeRemaining: z.number().nullish(),
      BatteryStatus: z.number().nullish(),
    }),
  ),
  fullCharge: z.array(
    z.object({ InstanceName: z.string().nullish(), FullChargedCapacity: z.number().nullish() }),
  ),
  design: z.array(
    z.object({ InstanceName: z.string().nullish(), DesignedCapacity: z.number().nullish() }),
  ),
});

type PowershellOutput = z.output<typeof powershellOutputSchema>;

export interface WindowsBatteryReaderDeps {
  run: (
    file: string,
    args: readonly string[],
    options: { timeout: number; windowsHide: boolean },
  ) => Promise<{ stdout: string }>;
  platform: NodeJS.Platform;
}

function numbersOf(values: (number | null | undefined)[]): number[] {
  return values.filter((value): value is number => typeof value === "number");
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function healthOf({ fullCharge, design }: PowershellOutput): number | undefined {
  if (fullCharge.length === 0 || fullCharge.length !== design.length) {
    return undefined;
  }
  const designedByName = new Map(
    design.map((entry) => [entry.InstanceName, entry.DesignedCapacity] as const),
  );
  let full = 0;
  let designed = 0;
  for (const { InstanceName, FullChargedCapacity } of fullCharge) {
    const designedCapacity = InstanceName == null ? undefined : designedByName.get(InstanceName);
    if (typeof FullChargedCapacity !== "number" || typeof designedCapacity !== "number") {
      return undefined;
    }
    full += FullChargedCapacity;
    designed += designedCapacity;
  }
  return batteryHealthPercent(full, designed);
}

function readingOf(output: PowershellOutput): BatteryReading {
  if (output.batteries.length === 0) {
    return { kind: "absent" };
  }
  const charges = numbersOf(output.batteries.map((battery) => battery.EstimatedChargeRemaining));
  if (charges.length === 0) {
    return { kind: "unreadable" };
  }
  const healthPercent = healthOf(output);
  return {
    kind: "present",
    chargePercent: Math.min(100, Math.max(0, Math.round(sum(charges) / charges.length))),
    ...(healthPercent === undefined ? {} : { healthPercent }),
    onBattery: output.batteries.some(
      ({ BatteryStatus }) => BatteryStatus != null && STATUSES_ON_BATTERY.has(BatteryStatus),
    ),
  };
}

export function windowsBatteryReader({ run, platform }: WindowsBatteryReaderDeps): BatteryReader {
  return {
    async read() {
      if (platform !== "win32") {
        return { kind: "unreadable" };
      }
      const { stdout } = await run(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", BATTERY_SCRIPT],
        { timeout: POWERSHELL_TIMEOUT_MS, windowsHide: true },
      );
      return readingOf(powershellOutputSchema.parse(JSON.parse(stdout)));
    },
  };
}
