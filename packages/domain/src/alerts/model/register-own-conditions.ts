import type { BranchWeeklyHoursRange } from "../../branch/index.js";
import {
  fiscalEmissionStopReasonOf,
  type LatestPreEmissionGateOutcome,
} from "../../fiscal/index.js";
import {
  type BatteryReport,
  batteryReportStanding,
  CRITICAL_BATTERY_PERCENT,
  type CriticalBatteryAction,
  criticalBatteryActionShowsCondition,
  isClockDrifted,
  isOnBatteryTooLong,
  isSerialDeviceMissing,
  ON_BATTERY_CONDITION_MINUTES,
  type SerialDeviceRole,
  type SerialDeviceStanding,
  type StorageStanding,
  storageSalesStopOf,
} from "../../register/index.js";
import {
  isInstallationRevoked,
  type SalesDenial,
  type SalesStopState,
  salesDenialOf,
} from "../../sync/index.js";
import { type AlertKind, type AlertLevel, isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { isRegisterQuiet } from "./quiet-register.js";

export const REGISTER_OWN_CONDITIONS = [
  "installation_revoked",
  "sales_denied",
  "fiscal_emission_stopped",
  "clock_drift",
  "register_silent",
  "serial_device_missing",
  "disk_space_low",
  "wal_oversized",
  "battery_low",
  "on_battery",
  "battery_missing",
  "critical_battery_action_not_shutdown",
] as const satisfies readonly (
  | AlertKind
  | "installation_revoked"
  | "serial_device_missing"
  | "disk_space_low"
  | "wal_oversized"
  | "battery_low"
  | "on_battery"
  | "battery_missing"
  | "critical_battery_action_not_shutdown"
)[];

export type RegisterOwnCondition = (typeof REGISTER_OWN_CONDITIONS)[number];

type SalesDeniedCondition = { kind: "sales_denied" } & SalesDenial;

type DetectedRegisterOwnCondition = {
  [Kind in RegisterOwnCondition]: Kind extends "sales_denied"
    ? SalesDeniedCondition
    : Kind extends "battery_low"
      ? { kind: Kind; charge_percent: number; critical_percent: number }
      : Kind extends "on_battery"
        ? { kind: Kind; threshold_minutes: number }
        : { kind: Kind };
}[RegisterOwnCondition];

type BatteryCondition = "battery_low" | "on_battery" | "battery_missing";

type HeldConditions<Kind extends RegisterOwnCondition> = {
  [Held in Kind]: Extract<DetectedRegisterOwnCondition, { kind: Held }> | null;
};

export function batteryConditionsOf(
  battery: BatteryReport | undefined,
): HeldConditions<BatteryCondition> {
  return {
    battery_low:
      batteryReportStanding(battery) === "low" && battery?.present === true
        ? {
            kind: "battery_low",
            charge_percent: battery.charge_percent,
            critical_percent: CRITICAL_BATTERY_PERCENT,
          }
        : null,
    on_battery: isOnBatteryTooLong(battery)
      ? { kind: "on_battery", threshold_minutes: ON_BATTERY_CONDITION_MINUTES }
      : null,
    battery_missing: battery?.present === false ? { kind: "battery_missing" } : null,
  };
}

type HeldRegisterOwnCondition = DetectedRegisterOwnCondition & { level: AlertLevel };

const LEVELS_OF_CONDITIONS_THAT_ARE_NOT_ALERTS = {
  installation_revoked: "critical",
  serial_device_missing: "warning",
  disk_space_low: "warning",
  wal_oversized: "warning",
  battery_low: "warning",
  on_battery: "critical",
  battery_missing: "warning",
  critical_battery_action_not_shutdown: "warning",
} as const satisfies Record<Exclude<RegisterOwnCondition, AlertKind>, AlertLevel>;

function levelOf(condition: RegisterOwnCondition): AlertLevel {
  return isAlertKind(condition)
    ? alertKindPolicy(condition).level
    : LEVELS_OF_CONDITIONS_THAT_ARE_NOT_ALERTS[condition];
}

interface RegisterOwnStanding {
  salesStop: SalesStopState;
  latestPreEmissionGate: LatestPreEmissionGateOutcome | undefined;
  lastAcceptedPushAt: Date | null;
  hours: readonly BranchWeeklyHoursRange[];
  now: Date;
  serialDevices: Record<SerialDeviceRole, SerialDeviceStanding> | null;
  storage: StorageStanding;
  localDatabaseDamaged: boolean;
  battery: BatteryReport | undefined;
  newSalesStoppedByBattery: boolean;
  criticalBatteryAction: CriticalBatteryAction;
  clockOffsetMs: number | null;
}

export function registerOwnConditions({
  salesStop,
  latestPreEmissionGate,
  lastAcceptedPushAt,
  hours,
  now,
  serialDevices,
  storage,
  localDatabaseDamaged,
  battery,
  newSalesStoppedByBattery,
  criticalBatteryAction,
  clockOffsetMs,
}: RegisterOwnStanding): HeldRegisterOwnCondition[] {
  const revoked = isInstallationRevoked(salesStop);
  const denial = salesDenialOf(
    salesStop,
    storageSalesStopOf(storage),
    localDatabaseDamaged,
    newSalesStoppedByBattery,
  );
  const held: HeldConditions<RegisterOwnCondition> = {
    installation_revoked: revoked ? { kind: "installation_revoked" } : null,
    sales_denied: denial === undefined ? null : { kind: "sales_denied", ...denial },
    fiscal_emission_stopped:
      !salesStop.stopped && fiscalEmissionStopReasonOf(latestPreEmissionGate) !== undefined
        ? { kind: "fiscal_emission_stopped" }
        : null,
    clock_drift:
      clockOffsetMs !== null && isClockDrifted(clockOffsetMs) ? { kind: "clock_drift" } : null,
    register_silent:
      !revoked &&
      lastAcceptedPushAt !== null &&
      isRegisterQuiet({ lastSuccessfulSyncAt: lastAcceptedPushAt, hours, now })
        ? { kind: "register_silent" }
        : null,
    serial_device_missing:
      serialDevices !== null && isSerialDeviceMissing(serialDevices)
        ? { kind: "serial_device_missing" }
        : null,
    disk_space_low:
      storage.diskStanding !== "enough" && denial?.reason !== "disk_full"
        ? { kind: "disk_space_low" }
        : null,
    wal_oversized: storage.walOversized ? { kind: "wal_oversized" } : null,
    ...batteryConditionsOf(battery),
    critical_battery_action_not_shutdown: criticalBatteryActionShowsCondition(criticalBatteryAction)
      ? { kind: "critical_battery_action_not_shutdown" }
      : null,
  };
  return REGISTER_OWN_CONDITIONS.flatMap((condition) => {
    const detected = held[condition];
    return detected === null ? [] : [{ ...detected, level: levelOf(condition) }];
  });
}
