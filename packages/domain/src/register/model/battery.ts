export const BATTERY_READ_INTERVAL_MS = 60_000;

export const CRITICAL_BATTERY_PUSH_LIMIT_MS = 10_000;

export const CRITICAL_BATTERY_SALE_RECHECK_MS = 5_000;

export const LOW_BATTERY_PERCENT = 20;

export const CRITICAL_BATTERY_PERCENT = 10;

export const ON_BATTERY_CONDITION_MINUTES = 10;

export type BatteryStanding = "normal" | "low" | "critical";

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
  return Math.floor((fullChargeCapacity * 100) / designCapacity);
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
      ? Math.max(
          0,
          Math.floor((now.getTime() - onBatterySince.getTime()) / MILLISECONDS_PER_MINUTE),
        )
      : 0;
  return {
    present: true,
    charge_percent: reading.chargePercent,
    ...(reading.healthPercent === undefined ? {} : { health_percent: reading.healthPercent }),
    on_battery: reading.onBattery,
    on_battery_minutes: onBatteryMinutes,
  };
}

function standingOf(chargePercent: number, onBattery: boolean): BatteryStanding {
  if (!onBattery) {
    return "normal";
  }
  if (chargePercent < CRITICAL_BATTERY_PERCENT) {
    return "critical";
  }
  return chargePercent < LOW_BATTERY_PERCENT ? "low" : "normal";
}

export function batteryStanding(reading: BatteryReading): BatteryStanding {
  return reading.kind === "present"
    ? standingOf(reading.chargePercent, reading.onBattery)
    : "normal";
}

export function batteryReportStanding(report: BatteryReport | undefined): BatteryStanding {
  return report?.present === true ? standingOf(report.charge_percent, report.on_battery) : "normal";
}

export function isOnBatteryTooLong(report: BatteryReport | undefined): boolean {
  return (
    report?.present === true &&
    report.on_battery &&
    report.on_battery_minutes > ON_BATTERY_CONDITION_MINUTES
  );
}
