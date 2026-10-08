import { type BranchWeeklyHoursRange, isSpanWithinBranchHours } from "../../branch/index.js";

export const QUIET_REGISTER_LAPSE_MS = 15 * 60 * 1000;

interface RegisterSyncStanding {
  lastAcceptedPushAt: Date | null;
  enrolledAt: Date;
  hours: readonly BranchWeeklyHoursRange[];
  now: Date;
}

export function isRegisterQuiet({
  lastAcceptedPushAt,
  enrolledAt,
  hours,
  now,
}: RegisterSyncStanding): boolean {
  const lapse = { start: new Date(now.getTime() - QUIET_REGISTER_LAPSE_MS), end: now };
  const lastHeardFrom = lastAcceptedPushAt ?? enrolledAt;
  return lastHeardFrom.getTime() <= lapse.start.getTime() && isSpanWithinBranchHours(lapse, hours);
}
