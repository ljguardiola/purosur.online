// Built from Microsoft's documented Win32_Battery, BatteryFullChargedCapacity and
// BatteryStaticData properties, not recorded from a Windows machine.

export const DISCHARGING_BATTERY_OUTPUT =
  '{"batteries":[{"EstimatedChargeRemaining":72,"BatteryStatus":1}],"fullCharge":[{"FullChargedCapacity":41400}],"design":[{"DesignedCapacity":46000}]}';

export const CHARGING_ON_MAINS_OUTPUT =
  '{"batteries":[{"EstimatedChargeRemaining":55,"BatteryStatus":2}],"fullCharge":[{"FullChargedCapacity":41400}],"design":[{"DesignedCapacity":46000}]}';

export const NO_BATTERY_OUTPUT = '{"batteries":[],"fullCharge":[],"design":[]}';

export const HEALTH_UNAVAILABLE_OUTPUT =
  '{"batteries":[{"EstimatedChargeRemaining":90,"BatteryStatus":1}],"fullCharge":[],"design":[]}';

export const TWO_BATTERIES_OUTPUT =
  '{"batteries":[{"EstimatedChargeRemaining":80,"BatteryStatus":2},{"EstimatedChargeRemaining":41,"BatteryStatus":1}],"fullCharge":[{"FullChargedCapacity":30000},{"FullChargedCapacity":20000}],"design":[{"DesignedCapacity":40000},{"DesignedCapacity":40000}]}';

export function batteryOutput(
  batteries: { EstimatedChargeRemaining: number | null; BatteryStatus: number | null }[],
): string {
  return JSON.stringify({ batteries, fullCharge: [], design: [] });
}
