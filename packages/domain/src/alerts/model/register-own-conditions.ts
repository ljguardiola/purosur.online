import type { BranchWeeklyHoursRange } from "../../branch/index.js";
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
import type { AlertKind } from "./alert-catalog.js";
import { isRegisterQuiet } from "./quiet-register.js";

export const REGISTER_OWN_CONDITIONS = [
  "installation_revoked",
  "sales_denied",
  "register_silent",
  "serial_device_missing",
] as const satisfies readonly (AlertKind | "installation_revoked" | "serial_device_missing")[];

export type RegisterOwnCondition = (typeof REGISTER_OWN_CONDITIONS)[number];

type HeldRegisterOwnCondition = {
  [Kind in RegisterOwnCondition]: Kind extends "sales_denied"
    ? { kind: Kind; reason: SalesDeniedReason }
    : { kind: Kind };
}[RegisterOwnCondition];

interface RegisterOwnStanding {
  salesStop: SalesStopState;
  lastAcceptedPushAt: Date | null;
  hours: readonly BranchWeeklyHoursRange[];
  now: Date;
  serialDevices: Record<SerialDeviceRole, SerialDeviceStanding> | null;
}

export function registerOwnConditions({
  salesStop,
  lastAcceptedPushAt,
  hours,
  now,
  serialDevices,
}: RegisterOwnStanding): HeldRegisterOwnCondition[] {
  const revoked = isInstallationRevoked(salesStop);
  const salesDenied = salesDeniedReportOf(salesStop);
  const held: {
    [Kind in RegisterOwnCondition]: Extract<HeldRegisterOwnCondition, { kind: Kind }> | null;
  } = {
    installation_revoked: revoked ? { kind: "installation_revoked" } : null,
    sales_denied:
      salesDenied.sales_denied === true
        ? { kind: "sales_denied", reason: salesDenied.sales_denied_reason }
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
  return REGISTER_OWN_CONDITIONS.flatMap((condition) => held[condition] ?? []);
}
