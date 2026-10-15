// Built from Microsoft's documented Win32_PowerPlan and Win32_PowerSettingDataIndex classes, not
// recorded from a Windows machine.

export function criticalBatteryActionOutput(values: (number | null)[]): string {
  return JSON.stringify({ values });
}
