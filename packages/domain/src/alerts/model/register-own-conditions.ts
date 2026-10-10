import type { BranchWeeklyHoursRange } from "../../branch/index.js";
import {
  isSerialDeviceMissing,
  type SerialDeviceRole,
  type SerialDeviceStanding,
} from "../../register/index.js";
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
}: RegisterOwnStanding): RegisterOwnCondition[] {
  const revoked = isInstallationRevoked(salesStop);
  const held: Record<RegisterOwnCondition, boolean> = {
    installation_revoked: revoked,
    sales_denied: salesDeniedReportOf(salesStop).sales_denied === true,
    register_silent:
      !revoked &&
      lastAcceptedPushAt !== null &&
      isRegisterQuiet({ lastSuccessfulSyncAt: lastAcceptedPushAt, hours, now }),
    serial_device_missing: serialDevices !== null && isSerialDeviceMissing(serialDevices),
  };
  return REGISTER_OWN_CONDITIONS.filter((condition) => held[condition]);
}
