// The branch settings' days fields are stored as Postgres `integer` columns; this is their ceiling.
export const BRANCH_SETTINGS_DAYS_MAX = 2_147_483_647;
export const BRANCH_SETTINGS_TEXT_MAX_LENGTH = 200;

export const DEFAULT_EXPIRING_LOT_ALERT_DAYS = 30;
export const DEFAULT_UNREVIEWED_PRICE_ALERT_DAYS = 30;
export const DEFAULT_GOOD_CONDITION_RETURN_DAYS = 15;
