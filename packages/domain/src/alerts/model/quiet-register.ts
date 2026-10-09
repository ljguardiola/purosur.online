import { type BranchWeeklyHoursRange, isSpanWithinBranchHours } from "../../branch/index.js";

export const QUIET_REGISTER_LAPSE_MS = 15 * 60 * 1000;

interface RegisterSyncStanding {
  lastSuccessfulSyncAt: Date;
  hours: readonly BranchWeeklyHoursRange[];
  now: Date;
}

export function isRegisterQuiet({
  lastSuccessfulSyncAt,
  hours,
  now,
}: RegisterSyncStanding): boolean {
  const lapse = { start: new Date(now.getTime() - QUIET_REGISTER_LAPSE_MS), end: now };
  return (
    lastSuccessfulSyncAt.getTime() <= lapse.start.getTime() && isSpanWithinBranchHours(lapse, hours)
  );
}
