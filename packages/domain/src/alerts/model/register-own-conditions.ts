import type { BranchWeeklyHoursRange } from "../../branch/index.js";
import {
  isInstallationRevoked,
  type SalesStopState,
  salesDeniedReportOf,
} from "../../sync/index.js";
import type { AlertKind } from "./alert-catalog.js";
import { isRegisterQuiet } from "./quiet-register.js";

export const REGISTER_OWN_CONDITIONS = [
  "sales_denied",
  "register_silent",
] as const satisfies readonly AlertKind[];

export type RegisterOwnCondition = (typeof REGISTER_OWN_CONDITIONS)[number];

interface RegisterOwnStanding {
  salesStop: SalesStopState;
  lastAcceptedPushAt: Date | null;
  hours: readonly BranchWeeklyHoursRange[];
  now: Date;
}

export function registerOwnConditions({
  salesStop,
  lastAcceptedPushAt,
  hours,
  now,
}: RegisterOwnStanding): RegisterOwnCondition[] {
  const held: Record<RegisterOwnCondition, boolean> = {
    sales_denied: salesDeniedReportOf(salesStop).sales_denied === true,
    register_silent:
      !isInstallationRevoked(salesStop) &&
      lastAcceptedPushAt !== null &&
      isRegisterQuiet({ lastSuccessfulSyncAt: lastAcceptedPushAt, hours, now }),
  };
  return REGISTER_OWN_CONDITIONS.filter((condition) => held[condition]);
}
