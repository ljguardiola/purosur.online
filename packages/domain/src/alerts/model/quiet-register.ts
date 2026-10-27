import { type BranchWeeklyHoursRange, isSpanWithinBranchHours } from "../../branch/index.js";
import type { ZoneRules } from "../../shared/index.js";

export const QUIET_REGISTER_LAPSE_MS = 15 * 60 * 1000;

interface RegisterSyncStanding {
  lastSuccessfulSyncAt: Date;
  hours: readonly BranchWeeklyHoursRange[];
  now: Date;
  rules: ZoneRules;
}

export function isRegisterQuiet({
  lastSuccessfulSyncAt,
  hours,
  now,
  rules,
}: RegisterSyncStanding): boolean {
  const lapse = { start: new Date(now.getTime() - QUIET_REGISTER_LAPSE_MS), end: now };
  return (
    lastSuccessfulSyncAt.getTime() <= lapse.start.getTime() &&
    isSpanWithinBranchHours(lapse, hours, rules)
  );
}
