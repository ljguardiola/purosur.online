import { CRITICAL_BATTERY_ACTIONS, type CriticalBatteryAction } from "@purosur/domain";
import { z } from "zod";
import type { CriticalBatteryActionReader } from "./critical-battery-action-reader";

const POWERSHELL_TIMEOUT_MS = 10_000;

const CRITICAL_BATTERY_ACTION_SETTING = "637ea02f-bbcb-4015-8e2c-a1c7b9c0b546";

const ACTION_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$plan = Get-CimInstance -Namespace root\\cimv2\\power -ClassName Win32_PowerPlan -Filter "IsActive=TRUE"',
  "$planGuid = ([regex]::Match($plan.InstanceID, '\\{([0-9a-fA-F-]+)\\}')).Groups[1].Value",
  `$values = @(Get-CimInstance -Namespace root\\cimv2\\power -ClassName Win32_PowerSettingDataIndex | Where-Object { $_.InstanceID -like "*$planGuid*\\DC\\*${CRITICAL_BATTERY_ACTION_SETTING}*" } | ForEach-Object { $_.SettingIndexValue })`,
  "[pscustomobject]@{ values = $values } | ConvertTo-Json -Compress",
].join("; ");

const powershellOutputSchema = z.object({ values: z.array(z.number().nullable()) });

export interface WindowsCriticalBatteryActionReaderDeps {
  run: (
    file: string,
    args: readonly string[],
    options: { timeout: number; windowsHide: boolean },
  ) => Promise<{ stdout: string }>;
  platform: NodeJS.Platform;
  onFailure?: (error: unknown) => void;
}

const UNREADABLE: CriticalBatteryAction = { kind: "unreadable" };

function actionOf(values: (number | null)[]): CriticalBatteryAction {
  const distinct = new Set(values);
  if (distinct.size !== 1) {
    return UNREADABLE;
  }
  const [value] = distinct;
  const action = value == null ? undefined : CRITICAL_BATTERY_ACTIONS[value];
  return action === undefined ? UNREADABLE : { kind: "read", action };
}

export function windowsCriticalBatteryActionReader({
  run,
  platform,
  onFailure,
}: WindowsCriticalBatteryActionReaderDeps): CriticalBatteryActionReader {
  return {
    async read() {
      if (platform !== "win32") {
        return UNREADABLE;
      }
      try {
        const { stdout } = await run(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", ACTION_SCRIPT],
          { timeout: POWERSHELL_TIMEOUT_MS, windowsHide: true },
        );
        return actionOf(powershellOutputSchema.parse(JSON.parse(stdout)).values);
      } catch (error) {
        onFailure?.(error);
        return UNREADABLE;
      }
    },
  };
}
