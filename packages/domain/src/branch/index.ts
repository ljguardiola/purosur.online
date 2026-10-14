export type { BranchWeeklyHoursRange } from "./model/branch-hours.js";
export {
  BRANCH_HOURS_RANGES_PER_DAY_MAX,
  branchHoursRangesOverlap,
  isBranchHoursRangeOrdered,
  isBranchHoursTime,
  isSpanWithinBranchHours,
} from "./model/branch-hours.js";
export {
  BRANCH_SETTINGS_DAYS_MAX,
  BRANCH_SETTINGS_TEXT_MAX_LENGTH,
  DEFAULT_EXPIRING_LOT_ALERT_DAYS,
  DEFAULT_GOOD_CONDITION_RETURN_DAYS,
  DEFAULT_UNREVIEWED_PRICE_ALERT_DAYS,
} from "./model/branch-settings.js";
