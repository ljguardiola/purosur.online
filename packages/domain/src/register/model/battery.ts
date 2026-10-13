export const BATTERY_READ_INTERVAL_MS = 60_000;

export type BatteryReading =
  | { kind: "unreadable" }
  | { kind: "absent" }
  | {
      kind: "present";
      chargePercent: number;
      healthPercent?: number | undefined;
      onBattery: boolean;
    };

export type BatteryReport =
  | { present: false }
  | {
      present: true;
      charge_percent: number;
      health_percent?: number | undefined;
      on_battery: boolean;
      on_battery_minutes: number;
    };

const MILLISECONDS_PER_MINUTE = 60_000;

export function batteryHealthPercent(
  fullChargeCapacity: number,
  designCapacity: number,
): number | undefined {
  if (designCapacity <= 0) {
    return undefined;
  }
  return Math.floor((fullChargeCapacity / designCapacity) * 100);
}

export function nextOnBatterySince(
  previous: Date | undefined,
  reading: BatteryReading,
  readAt: Date,
): Date | undefined {
  if (reading.kind === "unreadable") {
    return previous;
  }
  if (reading.kind === "present" && reading.onBattery) {
    return previous ?? readAt;
  }
  return undefined;
}

export function batteryReportOf(
  reading: BatteryReading,
  onBatterySince: Date | undefined,
  now: Date,
): BatteryReport | undefined {
  if (reading.kind === "unreadable") {
    return undefined;
  }
  if (reading.kind === "absent") {
    return { present: false };
  }
  const onBatteryMinutes =
    reading.onBattery && onBatterySince !== undefined
      ? Math.floor((now.getTime() - onBatterySince.getTime()) / MILLISECONDS_PER_MINUTE)
      : 0;
  return {
    present: true,
    charge_percent: reading.chargePercent,
    ...(reading.healthPercent === undefined ? {} : { health_percent: reading.healthPercent }),
    on_battery: reading.onBattery,
    on_battery_minutes: onBatteryMinutes,
  };
}
