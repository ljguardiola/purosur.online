// Built from Microsoft's documented Win32_Battery, BatteryFullChargedCapacity and
// BatteryStaticData properties, not recorded from a Windows machine.

export const FIRST_BATTERY = "ACPI\\PNP0C0A\\1_0";
export const SECOND_BATTERY = "ACPI\\PNP0C0A\\2_0";

export const DISCHARGING_BATTERY_OUTPUT = JSON.stringify({
  batteries: [{ EstimatedChargeRemaining: 72, BatteryStatus: 1 }],
  fullCharge: [{ InstanceName: FIRST_BATTERY, FullChargedCapacity: 41400 }],
  design: [{ InstanceName: FIRST_BATTERY, DesignedCapacity: 46000 }],
});

export const CHARGING_ON_MAINS_OUTPUT = JSON.stringify({
  batteries: [{ EstimatedChargeRemaining: 55, BatteryStatus: 2 }],
  fullCharge: [{ InstanceName: FIRST_BATTERY, FullChargedCapacity: 41400 }],
  design: [{ InstanceName: FIRST_BATTERY, DesignedCapacity: 46000 }],
});

export const NO_BATTERY_OUTPUT = '{"batteries":[],"fullCharge":[],"design":[]}';

export const HEALTH_UNAVAILABLE_OUTPUT =
  '{"batteries":[{"EstimatedChargeRemaining":90,"BatteryStatus":1}],"fullCharge":[],"design":[]}';

export const TWO_BATTERIES_OUTPUT = JSON.stringify({
  batteries: [
    { EstimatedChargeRemaining: 80, BatteryStatus: 2 },
    { EstimatedChargeRemaining: 41, BatteryStatus: 1 },
  ],
  fullCharge: [
    { InstanceName: FIRST_BATTERY, FullChargedCapacity: 30000 },
    { InstanceName: SECOND_BATTERY, FullChargedCapacity: 20000 },
  ],
  design: [
    { InstanceName: SECOND_BATTERY, DesignedCapacity: 40000 },
    { InstanceName: FIRST_BATTERY, DesignedCapacity: 40000 },
  ],
});

type FullChargeEntry = { InstanceName?: string | null; FullChargedCapacity: number | null };
type DesignEntry = { InstanceName?: string | null; DesignedCapacity: number | null };

export function capacitiesOutput(fullCharge: FullChargeEntry[], design: DesignEntry[]): string {
  return JSON.stringify({
    batteries: [{ EstimatedChargeRemaining: 50, BatteryStatus: 2 }],
    fullCharge,
    design,
  });
}

export function batteryOutput(
  batteries: { EstimatedChargeRemaining: number | null; BatteryStatus: number | null }[],
): string {
  return JSON.stringify({ batteries, fullCharge: [], design: [] });
}
