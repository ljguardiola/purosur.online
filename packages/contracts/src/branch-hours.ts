// A technical cap only, not a business rule: it keeps a day's ranges from growing unbounded. The
// backoffice stops offering "+" once a day reaches it.
export const BRANCH_HOURS_RANGES_PER_DAY_MAX = 6;
