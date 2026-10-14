import type { BranchWeeklyHoursRange } from "../../branch/index.js";
import {
  fiscalEmissionStopReasonOf,
  type LatestPreEmissionGateOutcome,
} from "../../fiscal/index.js";
import {
  type DiskStanding,
  isSerialDeviceMissing,
  type SerialDeviceRole,
  type SerialDeviceStanding,
} from "../../register/index.js";
import type { SalesDeniedReason } from "../../shared/index.js";
import { isInstallationRevoked, type SalesStopState } from "../../sync/index.js";
import { type AlertKind, type AlertLevel, isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { isRegisterQuiet } from "./quiet-register.js";

export const REGISTER_OWN_CONDITIONS = [
  "installation_revoked",
  "sales_denied",
  "fiscal_emission_stopped",
  "register_silent",
  "serial_device_missing",
  "disk_space_low",
  "wal_oversized",
] as const satisfies readonly (
  | AlertKind
  | "installation_revoked"
  | "serial_device_missing"
  | "disk_space_low"
  | "wal_oversized"
)[];

export type RegisterOwnCondition = (typeof REGISTER_OWN_CONDITIONS)[number];

type StorageSalesDeniedReason = "disk_space_short_at_startup" | "disk_full";

type SalesDeniedCondition =
  | { kind: "sales_denied"; reason: Exclude<SalesDeniedReason, StorageSalesDeniedReason> }
  | { kind: "sales_denied"; reason: "disk_space_short_at_startup"; required_free_bytes: number }
  | { kind: "sales_denied"; reason: "disk_full"; disk_free_ratio: number };

type DetectedRegisterOwnCondition = {
  [Kind in RegisterOwnCondition]: Kind extends "sales_denied"
    ? SalesDeniedCondition
    : { kind: Kind };
}[RegisterOwnCondition];

type HeldRegisterOwnCondition = DetectedRegisterOwnCondition & { level: AlertLevel };

const LEVELS_OF_CONDITIONS_THAT_ARE_NOT_ALERTS = {
  installation_revoked: "critical",
  serial_device_missing: "warning",
  disk_space_low: "warning",
  wal_oversized: "warning",
} as const satisfies Record<Exclude<RegisterOwnCondition, AlertKind>, AlertLevel>;

function levelOf(condition: RegisterOwnCondition): AlertLevel {
  return isAlertKind(condition)
    ? alertKindPolicy(condition).level
    : LEVELS_OF_CONDITIONS_THAT_ARE_NOT_ALERTS[condition];
}

export interface StorageStanding {
  startupShortOf: { requiredFreeBytes: number } | null;
  diskStanding: DiskStanding;
  diskFreeRatio: number;
  walOversized: boolean;
}

function salesDeniedConditionOf(
  salesStop: SalesStopState,
  storage: StorageStanding | null,
): SalesDeniedCondition | null {
  if (salesStop.stopped) {
    return salesStop.reason === "event_history_broken"
      ? { kind: "sales_denied", reason: "event_history_broken" }
      : null;
  }
  if (storage === null) {
    return null;
  }
  if (storage.startupShortOf !== null) {
    return {
      kind: "sales_denied",
      reason: "disk_space_short_at_startup",
      required_free_bytes: storage.startupShortOf.requiredFreeBytes,
    };
  }
  return storage.diskStanding === "full"
    ? { kind: "sales_denied", reason: "disk_full", disk_free_ratio: storage.diskFreeRatio }
    : null;
}

interface RegisterOwnStanding {
  salesStop: SalesStopState;
  latestPreEmissionGate: LatestPreEmissionGateOutcome | undefined;
  lastAcceptedPushAt: Date | null;
  hours: readonly BranchWeeklyHoursRange[];
  now: Date;
  serialDevices: Record<SerialDeviceRole, SerialDeviceStanding> | null;
  storage?: StorageStanding | null | undefined;
}

export function registerOwnConditions({
  salesStop,
  latestPreEmissionGate,
  lastAcceptedPushAt,
  hours,
  now,
  serialDevices,
  storage = null,
}: RegisterOwnStanding): HeldRegisterOwnCondition[] {
  const revoked = isInstallationRevoked(salesStop);
  const held: {
    [Kind in RegisterOwnCondition]: Extract<DetectedRegisterOwnCondition, { kind: Kind }> | null;
  } = {
    installation_revoked: revoked ? { kind: "installation_revoked" } : null,
    sales_denied: salesDeniedConditionOf(salesStop, storage),
    fiscal_emission_stopped:
      !salesStop.stopped && fiscalEmissionStopReasonOf(latestPreEmissionGate) !== undefined
        ? { kind: "fiscal_emission_stopped" }
        : null,
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
    disk_space_low: storage?.diskStanding === "low" ? { kind: "disk_space_low" } : null,
    wal_oversized: storage?.walOversized === true ? { kind: "wal_oversized" } : null,
  };
  return REGISTER_OWN_CONDITIONS.flatMap((condition) => {
    const detected = held[condition];
    return detected === null ? [] : [{ ...detected, level: levelOf(condition) }];
  });
}
