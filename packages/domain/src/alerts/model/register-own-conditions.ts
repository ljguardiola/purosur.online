import type { BranchWeeklyHoursRange } from "../../branch/index.js";
import {
  fiscalEmissionStopReasonOf,
  type LatestPreEmissionGateOutcome,
} from "../../fiscal/index.js";
import {
  isSerialDeviceMissing,
  type SerialDeviceRole,
  type SerialDeviceStanding,
} from "../../register/index.js";
import type { SalesDeniedReason } from "../../shared/index.js";
import {
  isInstallationRevoked,
  type SalesStopState,
  salesDeniedReportOf,
} from "../../sync/index.js";
import { type AlertKind, type AlertLevel, isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { isRegisterQuiet } from "./quiet-register.js";

export const REGISTER_OWN_CONDITIONS = [
  "installation_revoked",
  "sales_denied",
  "fiscal_emission_stopped",
  "register_silent",
  "serial_device_missing",
] as const satisfies readonly (AlertKind | "installation_revoked" | "serial_device_missing")[];

export type RegisterOwnCondition = (typeof REGISTER_OWN_CONDITIONS)[number];

type DetectedRegisterOwnCondition = {
  [Kind in RegisterOwnCondition]: Kind extends "sales_denied"
    ? { kind: Kind; reason: SalesDeniedReason }
    : { kind: Kind };
}[RegisterOwnCondition];

type HeldRegisterOwnCondition = DetectedRegisterOwnCondition & { level: AlertLevel };

const LEVELS_OF_CONDITIONS_THAT_ARE_NOT_ALERTS = {
  installation_revoked: "critical",
  serial_device_missing: "warning",
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
}

export function registerOwnConditions({
  salesStop,
  latestPreEmissionGate,
  lastAcceptedPushAt,
  hours,
  now,
  serialDevices,
}: RegisterOwnStanding): HeldRegisterOwnCondition[] {
  const revoked = isInstallationRevoked(salesStop);
  const salesDenied = salesDeniedReportOf(salesStop);
  const held: {
    [Kind in RegisterOwnCondition]: Extract<DetectedRegisterOwnCondition, { kind: Kind }> | null;
  } = {
    installation_revoked: revoked ? { kind: "installation_revoked" } : null,
    sales_denied:
      salesDenied.sales_denied === true
        ? { kind: "sales_denied", reason: salesDenied.sales_denied_reason }
        : null,
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
  };
  return REGISTER_OWN_CONDITIONS.flatMap((condition) => {
    const detected = held[condition];
    return detected === null ? [] : [{ ...detected, level: levelOf(condition) }];
  });
}
