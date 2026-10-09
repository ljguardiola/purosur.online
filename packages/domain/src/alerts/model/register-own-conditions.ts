import type { BranchWeeklyHoursRange } from "../../branch/index.js";
import type { AlertKind } from "./alert-catalog.js";
import { isRegisterQuiet } from "./quiet-register.js";

export const REGISTER_OWN_CONDITIONS = [
  "sales_denied",
  "register_silent",
] as const satisfies readonly AlertKind[];

export type RegisterOwnCondition = (typeof REGISTER_OWN_CONDITIONS)[number];

interface RegisterOwnStanding {
  salesStopped: boolean;
  lastAcceptedPushAt: Date | null;
  hours: readonly BranchWeeklyHoursRange[];
  now: Date;
}

export function registerOwnConditions({
  salesStopped,
  lastAcceptedPushAt,
  hours,
  now,
}: RegisterOwnStanding): RegisterOwnCondition[] {
  const held: Record<RegisterOwnCondition, boolean> = {
    sales_denied: salesStopped,
    register_silent:
      lastAcceptedPushAt !== null &&
      isRegisterQuiet({ lastSuccessfulSyncAt: lastAcceptedPushAt, hours, now }),
  };
  return REGISTER_OWN_CONDITIONS.filter((condition) => held[condition]);
}
